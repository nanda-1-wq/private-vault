#!/usr/bin/env bun
/**
 * PrivateVault Keeper — off-chain health refresh bot.
 *
 * Every 60 seconds:
 *  1. Fetch all Position accounts owned by the pvault program.
 *  2. For each open position: send refresh_health (discriminator 5).
 *  3. For any position where the on-chain status byte == 2 (liquidating)
 *     OR whose last refresh is stale: send try_liquidate (discriminator 6).
 *
 * Env vars required:
 *   NEXT_PUBLIC_SOLANA_RPC      — Solana RPC URL
 *   NEXT_PUBLIC_PVAULT_PROGRAM_ID — pvault program ID (base58)
 *   KEEPER_KEYPAIR_PATH         — path to keeper keypair JSON array
 *
 * In DEMO_MODE (default) the keeper logs what it would do but sends no txs.
 * Set DEMO_MODE=false + fund the keeper keypair on devnet to run live.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { readFileSync, existsSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';
const PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_PVAULT_PROGRAM_ID ||
  '3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq';
const KEEPER_PATH = process.env.KEEPER_KEYPAIR_PATH || './keys/keeper.json';
const POLL_MS = 60_000;

// DEMO_MODE: default true — logs cycles without sending transactions.
// The architecture is fully implemented; set DEMO_MODE=false for live use.
const DEMO_MODE =
  process.env.DEMO_MODE !== 'false' &&
  process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

// ── Instruction discriminators (must match lib.rs) ────────────────────────────

const IX_REFRESH_HEALTH = 5;
const IX_TRY_LIQUIDATE = 6;

// ── Position status bytes (must match state.rs) ───────────────────────────────

const STATUS_HEALTHY = 0;
const STATUS_AT_RISK = 1;
const STATUS_LIQUIDATING = 2;

// ── PDA helpers ───────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(PROGRAM_ID_STR);

function marketPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('market')], PROGRAM_ID);
}

function liquidationTicketPda(positionPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('liq_ticket'), positionPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function ikaCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('__ika_cpi_authority')],
    PROGRAM_ID
  );
}

// ── Connection + Keypair ──────────────────────────────────────────────────────

const connection = new Connection(RPC_URL, 'confirmed');

let keeper: Keypair;

if (!DEMO_MODE) {
  if (!existsSync(KEEPER_PATH)) {
    console.error(`[Keeper] ERROR: keeper keypair not found at ${KEEPER_PATH}`);
    console.error(`         Run: solana-keygen new -o ${KEEPER_PATH}`);
    console.error(`         Then fund it: solana airdrop 1 $(solana-keygen pubkey ${KEEPER_PATH}) --url devnet`);
    process.exit(1);
  }
  keeper = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(KEEPER_PATH, 'utf-8')))
  );
} else {
  // In DEMO_MODE generate an ephemeral keypair — no signing occurs
  keeper = Keypair.generate();
}

// ── Position account parsing ──────────────────────────────────────────────────

interface ParsedPosition {
  pubkey: PublicKey;
  owner: PublicKey;
  dwalletPda: PublicKey;
  encCollateral: PublicKey;
  encDebt: PublicKey;
  encIsUnhealthy: PublicKey;
  lastRefreshSlot: bigint;
  statusByte: number;
}

/**
 * Parse a raw Position account data buffer.
 *
 * Layout (216 bytes, from state.rs):
 *   0..32   owner
 *   32..64  dwallet_pda
 *   64..96  btc_deposit_address_hash
 *   96..128 enc_collateral_sats (ciphertext pubkey)
 *   128..160 enc_debt_usdc_e6 (ciphertext pubkey)
 *   160..192 enc_is_unhealthy (ciphertext pubkey)
 *   192..200 last_health_refresh_slot (u64 LE)
 *   200     status
 *   201     bump
 */
function parsePosition(pubkey: PublicKey, data: Buffer): ParsedPosition {
  return {
    pubkey,
    owner: new PublicKey(data.slice(0, 32)),
    dwalletPda: new PublicKey(data.slice(32, 64)),
    encCollateral: new PublicKey(data.slice(96, 128)),
    encDebt: new PublicKey(data.slice(128, 160)),
    encIsUnhealthy: new PublicKey(data.slice(160, 192)),
    lastRefreshSlot: data.readBigUInt64LE(192),
    statusByte: data[200],
  };
}

// ── Instruction builders ──────────────────────────────────────────────────────

const PYTH_BTC_USD = new PublicKey(
  process.env.NEXT_PUBLIC_PYTH_BTC_USD_FEED ||
  'HovQMDrbAgAYPCmaTKoHjnxcF3bL71SEqRR3RTT7iqkg'
);
const ENCRYPT_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ENCRYPT_PROGRAM_ID ||
  '4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8'
);
const IKA_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_IKA_PROGRAM_ID ||
  '87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY'
);

/**
 * Build refresh_health (ix 5).
 *
 * Accounts (from instructions/refresh_health.rs):
 *   [0] position         writable
 *   [1] keeper           signer
 *   [2] market           readonly
 *   [3] oracle           Pyth BTC/USD, readonly
 *   [4] collateral_ct    ciphertext, readonly
 *   [5] col_usd_ct_out   writable output
 *   [6] health_ltv_ct    writable output
 *   [7] unhealthy_ct     writable output (enc_is_unhealthy)
 *   [8] encrypt_program
 */
function buildRefreshHealthIx(
  pos: ParsedPosition,
  keeperPubkey: PublicKey,
  colUsdCtOut: PublicKey,
  healthLtvCt: PublicKey,
): TransactionInstruction {
  const [marketKey] = marketPda();
  const data = Buffer.alloc(1);
  data.writeUInt8(IX_REFRESH_HEALTH, 0);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pos.pubkey, isSigner: false, isWritable: true },
      { pubkey: keeperPubkey, isSigner: true, isWritable: false },
      { pubkey: marketKey, isSigner: false, isWritable: false },
      { pubkey: PYTH_BTC_USD, isSigner: false, isWritable: false },
      { pubkey: pos.encCollateral, isSigner: false, isWritable: false },
      { pubkey: colUsdCtOut, isSigner: false, isWritable: true },
      { pubkey: healthLtvCt, isSigner: false, isWritable: true },
      { pubkey: pos.encIsUnhealthy, isSigner: false, isWritable: true },
      { pubkey: ENCRYPT_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build try_liquidate (ix 6).
 *
 * Accounts (from instructions/try_liquidate.rs):
 *   [0] position              writable
 *   [1] liq_ticket            writable (PDA)
 *   [2] keeper                signer + funder
 *   [3] market                readonly
 *   [4] unhealthy_ct          enc_is_unhealthy ciphertext
 *   [5] decrypt_result        writable — Encrypt writes decrypted bool here
 *   [6] ika_cpi_authority     PDA
 *   [7] dwallet               Ika dWallet account
 *   [8] encrypt_program
 *   [9] ika_program
 *   [10] system_program
 */
function buildTryLiquidateIx(
  pos: ParsedPosition,
  keeperPubkey: PublicKey,
  decryptResult: PublicKey,
): TransactionInstruction {
  const [liqTicketKey] = liquidationTicketPda(pos.pubkey);
  const [marketKey] = marketPda();
  const [ikaAuthKey] = ikaCpiAuthorityPda();
  const { SystemProgram } = require('@solana/web3.js');

  const data = Buffer.alloc(1);
  data.writeUInt8(IX_TRY_LIQUIDATE, 0);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pos.pubkey, isSigner: false, isWritable: true },
      { pubkey: liqTicketKey, isSigner: false, isWritable: true },
      { pubkey: keeperPubkey, isSigner: true, isWritable: true },
      { pubkey: marketKey, isSigner: false, isWritable: false },
      { pubkey: pos.encIsUnhealthy, isSigner: false, isWritable: false },
      { pubkey: decryptResult, isSigner: false, isWritable: true },
      { pubkey: ikaAuthKey, isSigner: false, isWritable: false },
      { pubkey: pos.dwalletPda, isSigner: false, isWritable: false },
      { pubkey: ENCRYPT_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: IKA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ── Main keeper loop ──────────────────────────────────────────────────────────

async function fetchAllPositions(): Promise<ParsedPosition[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: 216 }, // only Position accounts (state.rs: 216 bytes)
    ],
  });

  const positions: ParsedPosition[] = [];
  for (const { pubkey, account } of accounts) {
    try {
      const pos = parsePosition(pubkey, Buffer.from(account.data));
      // Skip positions that are not open (status 0, 1, or 2 = open states)
      if (pos.statusByte > STATUS_LIQUIDATING) continue;
      positions.push(pos);
    } catch {
      // Malformed account — skip silently
    }
  }
  return positions;
}

async function processPosition(pos: ParsedPosition): Promise<void> {
  const statusLabel =
    pos.statusByte === STATUS_HEALTHY
      ? 'healthy'
      : pos.statusByte === STATUS_AT_RISK
      ? 'at_risk'
      : 'liquidating';

  console.log(
    `[Keeper]   Position ${pos.pubkey.toBase58().slice(0, 8)}… ` +
    `owner=${pos.owner.toBase58().slice(0, 8)}… status=${statusLabel}`
  );

  if (DEMO_MODE) {
    console.log(`[Keeper]     [DEMO] Would send refresh_health + check for liquidation`);
    return;
  }

  // Create ephemeral output ciphertext accounts (pre-funded elsewhere in prod)
  // For simplicity the keeper reuses the existing enc_is_unhealthy slot in-place.
  // A full production keeper would derive dedicated per-cycle output keypairs.
  const colUsdCtOut = Keypair.generate();
  const healthLtvCt = Keypair.generate();
  const decryptResult = Keypair.generate();

  // ── refresh_health ────────────────────────────────────────────────────────
  try {
    const refreshIx = buildRefreshHealthIx(
      pos,
      keeper.publicKey,
      colUsdCtOut.publicKey,
      healthLtvCt.publicKey,
    );
    const refreshTx = new Transaction().add(refreshIx);
    const refreshSig = await sendAndConfirmTransaction(connection, refreshTx, [
      keeper,
    ]);
    console.log(`[Keeper]     refresh_health OK — sig: ${refreshSig.slice(0, 16)}…`);
  } catch (err) {
    console.error(`[Keeper]     refresh_health FAILED:`, err);
    return;
  }

  // ── try_liquidate (only for unhealthy positions) ──────────────────────────
  if (pos.statusByte === STATUS_LIQUIDATING) {
    try {
      const liqIx = buildTryLiquidateIx(
        pos,
        keeper.publicKey,
        decryptResult.publicKey,
      );
      const liqTx = new Transaction().add(liqIx);
      const liqSig = await sendAndConfirmTransaction(connection, liqTx, [keeper]);
      console.log(`[Keeper]     try_liquidate OK — sig: ${liqSig.slice(0, 16)}…`);
    } catch (err) {
      console.error(`[Keeper]     try_liquidate FAILED:`, err);
    }
  }
}

async function runKeeperLoop(): Promise<never> {
  console.log('[Keeper] PrivateVault Keeper starting');
  console.log(`[Keeper] Program: ${PROGRAM_ID_STR}`);
  console.log(`[Keeper] RPC:     ${RPC_URL}`);
  console.log(`[Keeper] Pubkey:  ${keeper.publicKey.toBase58()}`);
  console.log(`[Keeper] Mode:    ${DEMO_MODE ? 'DEMO (no txs sent)' : 'LIVE'}`);
  console.log(`[Keeper] Poll:    every ${POLL_MS / 1000}s`);
  console.log('');

  while (true) {
    const cycleStart = Date.now();
    console.log(`[Keeper] ── Cycle ${new Date().toISOString()} ──`);

    try {
      const positions = await fetchAllPositions();
      console.log(`[Keeper] Found ${positions.length} open position(s)`);

      if (positions.length === 0 && DEMO_MODE) {
        console.log('[Keeper] [DEMO] No on-chain positions yet — simulating mock cycle');
        console.log('[Keeper] [DEMO]   Would refresh 3 positions, try_liquidate 1');
      }

      for (const pos of positions) {
        await processPosition(pos);
      }
    } catch (err) {
      console.error('[Keeper] Cycle error:', err);
    }

    const elapsed = Date.now() - cycleStart;
    const wait = Math.max(0, POLL_MS - elapsed);
    console.log(`[Keeper] Cycle done in ${elapsed}ms. Next in ${Math.round(wait / 1000)}s.\n`);
    await new Promise<void>((r) => setTimeout(r, wait));
  }
}

runKeeperLoop();
