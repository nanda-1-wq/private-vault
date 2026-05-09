/**
 * pvault program client - PDA derivation + instruction builders.
 * All instruction discriminators must match programs/pvault/src/lib.rs.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { PVAULT_PROGRAM_ID, ENCRYPT_PROGRAM_ID, IKA_PROGRAM_ID } from './config';

const PROGRAM_ID = new PublicKey(PVAULT_PROGRAM_ID);

// Pyth devnet BTC/USD price feed
// https://pyth.network/developers/price-feed-ids - devnet BTC/USD
const PYTH_BTC_USD_DEVNET = new PublicKey(
  process.env.NEXT_PUBLIC_PYTH_BTC_USD_FEED ||
  'HovQMDrbAgAYPCmaTKoHjnxcF3bL71SEqRR3RTT7iqkg'
);

// ------------------------------------------------------------------
// PDA derivation (seeds must match pda.rs exactly)
// ------------------------------------------------------------------

export function marketPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market')],
    PROGRAM_ID
  );
}

export function positionPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function liquidationTicketPda(position: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('liq_ticket'), position.toBuffer()],
    PROGRAM_ID
  );
}

export function ikaCpiAuthorityPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('__ika_cpi_authority')],
    PROGRAM_ID
  );
}

// ------------------------------------------------------------------
// Instruction discriminators (must match lib.rs)
// ------------------------------------------------------------------
export const IX = {
  InitMarket: 0,
  OpenPosition: 1,
  DepositCollateral: 2,
  Borrow: 3,
  Repay: 4,
  RefreshHealth: 5,
  TryLiquidate: 6,
  CommitLiquidation: 7,
} as const;

// ------------------------------------------------------------------
// Demo position data (returned when wallet connected in DEMO_MODE)
// ------------------------------------------------------------------
export interface PositionData {
  dwalletPda: string;
  btcAddress: string;
  collateralSats: number;
  debtUsdcE6: number;
  ltvBps: number;
  healthStatus: 'healthy' | 'at_risk' | 'liquidating' | 'unknown';
  encCollateralPubkey: string;
  encDebtPubkey: string;
}

export const DEMO_POSITION: PositionData = {
  dwalletPda: 'DWa11et11111111111111111111111111111111111111',
  btcAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  collateralSats: 15_000_000, // 0.15 BTC
  debtUsdcE6: 8_000_000_000, // $8,000 USDC (e6)
  ltvBps: 5930, // 59.3%
  healthStatus: 'healthy',
  encCollateralPubkey: 'Enc1000000000000001111111111111111111111111',
  encDebtPubkey: 'Enc2000000000000001111111111111111111111111',
};

// ------------------------------------------------------------------
// Fetch on-chain position (stub for demo)
// ------------------------------------------------------------------
export async function fetchPosition(
  connection: Connection,
  owner: PublicKey,
  demo: boolean
): Promise<PositionData | null> {
  if (demo) {
    await new Promise<void>((r) => setTimeout(r, 600));
    return DEMO_POSITION;
  }

  const [pda] = positionPda(owner);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;

  // Parse raw Position account bytes (see state.rs for layout)
  // Offset map:
  //   0..32:   owner
  //   32..64:  dwallet_pda
  //   64..96:  btc_deposit_address_hash
  //   96..128: enc_collateral_sats ciphertext pubkey
  //   128..160: enc_debt_usdc_e6 ciphertext pubkey
  //   160..192: enc_is_unhealthy ciphertext pubkey
  //   192..200: last_health_refresh_slot (u64 LE)
  //   200:     status (u8)
  //   201:     bump (u8)
  const data = info.data;
  const dwalletPda = new PublicKey(data.slice(32, 64)).toBase58();
  const encCollateralPubkey = new PublicKey(data.slice(96, 128)).toBase58();
  const encDebtPubkey = new PublicKey(data.slice(128, 160)).toBase58();
  const statusByte = data[200];
  const healthStatus =
    statusByte === 0 ? 'healthy' : statusByte === 1 ? 'at_risk' : 'liquidating';

  return {
    dwalletPda,
    btcAddress: 'unknown', // requires separate Ika lookup
    collateralSats: 0, // encrypted - cannot read directly
    debtUsdcE6: 0, // encrypted - cannot read directly
    ltvBps: 0, // recomputed via FHE - unknown without decryption
    healthStatus,
    encCollateralPubkey,
    encDebtPubkey,
  };
}

// ------------------------------------------------------------------
// Hash a BTC address to 32 bytes for the on-chain position field.
// Uses SubtleCrypto SHA-256 (available in browser + Node >=15).
// ------------------------------------------------------------------
async function hashBtcAddress(btcAddress: string): Promise<Buffer> {
  const encoded = new TextEncoder().encode(btcAddress);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Buffer.from(hash);
}

// ------------------------------------------------------------------
// OpenPosition - discriminator 1
//
// Accounts (0-indexed):
//   [0] position       - PDA [b"position", owner], writable
//   [1] owner          - signer, writable (pays rent)
//   [2] dwallet        - Ika dWallet PDA
//   [3] market         - Market PDA (readonly)
//   [4] system_program
//
// Data: [0x01] + [32 bytes: SHA-256(btcAddress)]
// ------------------------------------------------------------------
export async function buildOpenPositionInstruction(
  owner: PublicKey,
  dwalletPda: string,
  btcAddress: string
): Promise<TransactionInstruction> {
  const [positionPdaKey] = positionPda(owner);
  const [marketPdaKey] = marketPda();
  const btcHash = await hashBtcAddress(btcAddress);

  const data = Buffer.alloc(1 + 32);
  data.writeUInt8(IX.OpenPosition, 0);
  btcHash.copy(data, 1);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: positionPdaKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(dwalletPda), isSigner: false, isWritable: false },
      { pubkey: marketPdaKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ------------------------------------------------------------------
// DepositCollateral - discriminator 2
//
// Accounts (0-indexed):
//   [0] position          - PDA [b"position", owner], writable
//   [1] owner             - signer
//   [2] collateral_ct     - writable 98-byte EUint64 ciphertext (pre-funded by Encrypt)
//   [3] collateral_usd_ct - writable 98-byte output ciphertext (pre-funded)
//   [4] market            - Market PDA (readonly)
//   [5] oracle            - Pyth BTC/USD price feed (readonly)
//   [6] encrypt_program
//
// Data: [0x02] + [8 bytes: collateral_sats as u64 LE]
// ------------------------------------------------------------------
export function buildDepositInstruction(
  owner: PublicKey,
  collateralCt: PublicKey,
  collateralUsdCt: PublicKey,
  collateralSats: bigint
): TransactionInstruction {
  const [positionPdaKey] = positionPda(owner);
  const [marketPdaKey] = marketPda();

  const data = Buffer.alloc(9);
  data.writeUInt8(IX.DepositCollateral, 0);
  data.writeBigUInt64LE(collateralSats, 1);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: positionPdaKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: collateralCt, isSigner: false, isWritable: true },
      { pubkey: collateralUsdCt, isSigner: false, isWritable: true },
      { pubkey: marketPdaKey, isSigner: false, isWritable: false },
      { pubkey: PYTH_BTC_USD_DEVNET, isSigner: false, isWritable: false },
      { pubkey: new PublicKey(ENCRYPT_PROGRAM_ID), isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ------------------------------------------------------------------
// Borrow - discriminator 3
//
// Accounts (0-indexed):
//   [0]  position        - PDA [b"position", owner], writable
//   [1]  owner           - signer
//   [2]  market          - Market PDA (readonly)
//   [3]  user_usdc_ata   - user's USDC ATA, writable
//   [4]  usdc_vault      - program USDC vault, writable
//   [5]  oracle          - Pyth BTC/USD price feed (readonly)
//   [6]  collateral_ct   - encrypted_collateral_sats ciphertext
//   [7]  col_usd_ct_out  - writable 98-byte output: calc_collateral_usd result
//   [8]  health_ltv_ct   - writable 98-byte output: calc_health ltv_bps
//   [9]  unhealthy_ct    - writable 98-byte output: calc_health is_unhealthy
//   [10] debt_ct         - encrypted_debt_usdc_e6 ciphertext
//   [11] new_debt_ct     - writable 98-byte output: apply_borrow result
//   [12] decrypt_result  - writable 16-byte account for decryption result
//   [13] encrypt_program
//   [14] token_program   - SPL Token
//   [15] vault_authority - CPI authority PDA
//
// Data: [0x03] + [8 bytes: borrow_amount_usdc_e6 as u64 LE]
// ------------------------------------------------------------------
export function buildBorrowInstruction(
  owner: PublicKey,
  borrowAmountE6: bigint,
  accounts: {
    userUsdcAta: PublicKey;
    usdcVault: PublicKey;
    collateralCt: PublicKey;
    colUsdCtOut: PublicKey;
    healthLtvCt: PublicKey;
    unhealthyCt: PublicKey;
    debtCt: PublicKey;
    newDebtCt: PublicKey;
    decryptResult: PublicKey;
  }
): TransactionInstruction {
  const [positionPdaKey] = positionPda(owner);
  const [marketPdaKey] = marketPda();
  const [vaultAuthorityKey] = ikaCpiAuthorityPda();
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const data = Buffer.alloc(9);
  data.writeUInt8(IX.Borrow, 0);
  data.writeBigUInt64LE(borrowAmountE6, 1);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: positionPdaKey, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: marketPdaKey, isSigner: false, isWritable: false },
      { pubkey: accounts.userUsdcAta, isSigner: false, isWritable: true },
      { pubkey: accounts.usdcVault, isSigner: false, isWritable: true },
      { pubkey: PYTH_BTC_USD_DEVNET, isSigner: false, isWritable: false },
      { pubkey: accounts.collateralCt, isSigner: false, isWritable: false },
      { pubkey: accounts.colUsdCtOut, isSigner: false, isWritable: true },
      { pubkey: accounts.healthLtvCt, isSigner: false, isWritable: true },
      { pubkey: accounts.unhealthyCt, isSigner: false, isWritable: true },
      { pubkey: accounts.debtCt, isSigner: false, isWritable: false },
      { pubkey: accounts.newDebtCt, isSigner: false, isWritable: true },
      { pubkey: accounts.decryptResult, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(ENCRYPT_PROGRAM_ID), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: vaultAuthorityKey, isSigner: false, isWritable: false },
    ],
    data,
  });
}
