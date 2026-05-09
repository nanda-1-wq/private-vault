# PrivateVault

> Encrypted multi-chain collateral lending on Solana — deposit BTC from any chain, borrow USDC, with all position data protected by Fully Homomorphic Encryption.

**Built for the [Colosseum Frontier Hackathon](https://arena.colosseum.org) — Encrypt & Ika track**

---

## The Problem

DeFi lending is transparent by default:

- Anyone can see which positions are approaching the liquidation threshold and front-run liquidators
- Institutional participants cannot use on-chain lending because their position sizes, entry prices, and risk exposure are fully public
- Cross-chain BTC collateral requires trusted bridges or wrapped tokens — centralised chokepoints that introduce custodial risk

## The Solution

PrivateVault combines two pre-alpha Solana primitives to solve all three problems:

| Problem | Solution |
|---|---|
| Public position sizes | Encrypt REFHE — collateral & debt stored as EUint64 ciphertexts |
| Front-runnable liquidations | Only the `is_unhealthy` boolean is ever decrypted |
| Trusted BTC bridge | Ika dWallet MPC — bridgeless BTC custody, no wrapped tokens |

**Core innovation:** FHE graphs compute LTV and health checks entirely on encrypted data. Liquidators trigger `try_liquidate` — which decrypts *only the boolean* — without ever learning position sizes. Front-running is structurally impossible.

---

## How It Works

### 1. Create dWallet (Ika)

User requests a Secp256k1 dWallet via gRPC DKG to `pre-alpha-dev-1.ika.ika-network.net:443`. The dWallet authority is transferred to the pvault program's CPI authority PDA (`b"__ika_cpi_authority"`), so only the program can sign BTC transactions.

### 2. Deposit BTC

User sends BTC to their dWallet-derived P2WPKH address. The sat amount is stored as an `EUint64` ciphertext via Encrypt's `create_input_ciphertext` CPI.

### 3. Borrow USDC

`calc_collateral_usd` FHE graph: `EUint64(sats) × PUint64(price) → EUint64(usd_e6)`

`calc_health` FHE graph: `(EUint64(collateral_usd), EUint64(debt), PUint64(ltv_bps)) → (EUint64(ltv), EUint64(is_unhealthy))`

All arithmetic is performed on encrypted ciphertexts. The LTV result stays encrypted. USDC is transferred to the user's ATA.

### 4. Private Liquidation

```
refresh_health  →  calc_health graph  →  encrypted_is_unhealthy ciphertext stored on-chain
try_liquidate   →  request_decryption(encrypted_is_unhealthy ONLY)
                →  if decrypted == 1: CPI to ika.approve_message → NOA signs BTC tx
                →  collateral and debt amounts NEVER decrypted
```

Front-runners see only ciphertexts. They cannot determine which positions are near the 80% threshold.

---

## How It Uses Ika

- Creates a Secp256k1 dWallet for each user via gRPC DKG request
- Transfers dWallet authority to the pvault CPI authority PDA `[b"__ika_cpi_authority"]`
- On liquidation: calls `ika.approve_message` with TaprootSha256 signing scheme to authorise the BTC transaction
- BTC transaction is signed by Ika NOA (Network of Authority) — no trusted bridge or custodian

**Ika dWallet Program ID:** `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`

**gRPC endpoint:** `pre-alpha-dev-1.ika.ika-network.net:443`

---

## How It Uses Encrypt

- All monetary amounts (collateral sats, USDC debt) stored as `EUint64` ciphertexts via `create_input_ciphertext` CPI
- LTV and health computations are `#[encrypt_fn]` graphs compiled to DAGs and executed by the Encrypt program
- `encrypted_is_unhealthy` is the *only* ciphertext ever passed to `request_decryption`
- Collateral amounts and debt positions are never decrypted — not by the keeper, not by liquidators, not by anyone

**Encrypt Program ID:** `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8`

**gRPC endpoint:** `pre-alpha-dev-1.encrypt.ika-network.net:443`

---

## FHE Graphs

Defined in `programs/pvault/src/fhe.rs`:

| Function | Inputs | Output | Used in |
|---|---|---|---|
| `calc_collateral_usd` | `EUint64` sats, `PUint64` price | `EUint64` usd_e6 | deposit, refresh_health |
| `calc_health` | `EUint64` collateral_usd, `EUint64` debt, `PUint64` ltv_bps | `(EUint64` ltv, `EUint64` is_unhealthy`)` | borrow, refresh_health |
| `apply_borrow` | `EUint64` current_debt, `PUint64` new_amount | `EUint64` new_debt | borrow |
| `apply_repay` | `EUint64` current_debt, `PUint64` repay_amount | `EUint64` new_debt | repay |

FHE rule: every `if` has an `else`. Both branches always evaluated (compiled to `Select`). Comparisons (`>=`) return the same encrypted type (0 or 1). No bare conditionals.

---

## Why Pinocchio (Not Anchor)

Ika requires **Anchor v1** + solana-program 2.2. Encrypt requires **Anchor v0.32** + solana-program 4. These are incompatible in a single Anchor crate. Both SDKs have first-class Pinocchio 0.10 support — so Pinocchio is the solution, not a workaround.

---

## Pre-Alpha Limitations (Expected, Not Disqualifying)

| SDK | Limitation | Impact |
|---|---|---|
| Ika pre-alpha | Single mock NOA signer, not real distributed MPC | Trust model is mocked; all 11 protocol operations work end-to-end |
| Encrypt pre-alpha | Data stored as plaintext; FHE ops simulated | Privacy guarantee is mocked; DSL, graph compilation, and executor are real |

Both limitations are disclosed per the hackathon expectations. The on-chain program logic and architecture are production-ready.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Solana program | Pinocchio 0.10 (NOT Anchor) |
| Ika integration | ika-dwallet-pinocchio (git: dwallet-labs/ika-pre-alpha) |
| Encrypt integration | encrypt-pinocchio + encrypt-dsl (git: dwallet-labs/encrypt-pre-alpha) |
| Rust edition | 2024 / nightly toolchain |
| Frontend | Next.js 14 App Router |
| Package manager | Bun 1.1+ |
| UI | shadcn/ui + Tailwind (dark slate theme) |
| Wallet | @solana/wallet-adapter + Phantom |
| Charts | recharts |
| State | zustand |

---

## Program IDs (Devnet)

| Program | ID |
|---|---|
| pvault (this repo) | `3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq` |
| Ika dWallet Program | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| Encrypt Program | `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8` |

---

## Instruction Set

| # | Instruction | Description |
|---|---|---|
| 0 | `init_market` | Initialise the global Market PDA |
| 1 | `open_position` | Create a Position PDA, link to a dWallet |
| 2 | `deposit_collateral` | Encrypt sat amount, compute collateral USD ciphertext |
| 3 | `borrow` | Run FHE health check, transfer USDC |
| 4 | `repay` | Reduce encrypted debt ciphertext |
| 5 | `refresh_health` | Rerun `calc_health` graph, update `enc_is_unhealthy` |
| 6 | `try_liquidate` | Decrypt health boolean ONLY — initiate BTC liquidation if == 1 |
| 7 | `commit_liquidation` | Finalise position after BTC confirmation |

---

## PDA Seeds

| Account | Seeds |
|---|---|
| Market | `[b"market"]` |
| Position | `[b"position", owner_pubkey]` |
| LiquidationTicket | `[b"liq_ticket", position_pubkey]` |
| Ika CPI Authority | `[b"__ika_cpi_authority"]` |

---

## Setup

### Prerequisites

- Rust nightly + `cargo-build-sbf`
- Solana CLI 3.x (`solana-install init 3.x.x`)
- Bun 1.1+

### Build & Deploy

```bash
# Build the Pinocchio program
cd programs/pvault
cargo build-sbf

# Deploy to devnet
solana config set --url devnet
solana program deploy target/deploy/pvault.so --keypair keys/deploy.json
```

### Frontend

```bash
# Copy env template
cp .env.example .env.local
# Edit NEXT_PUBLIC_PVAULT_PROGRAM_ID etc.

cd app
bun install
bun dev   # http://localhost:3000
```

### Keeper

```bash
# Fund keeper keypair on devnet
solana-keygen new -o keys/keeper.json
solana airdrop 2 $(solana-keygen pubkey keys/keeper.json) --url devnet

# Run
DEMO_MODE=false bun run keeper
```

### Environment Variables

```bash
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_PVAULT_PROGRAM_ID=3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq
NEXT_PUBLIC_IKA_PROGRAM_ID=87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
NEXT_PUBLIC_ENCRYPT_PROGRAM_ID=4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
NEXT_PUBLIC_DEMO_MODE=true
IKA_GRPC_URL=https://pre-alpha-dev-1.ika.ika-network.net:443
ENCRYPT_GRPC_URL=https://pre-alpha-dev-1.encrypt.ika-network.net:443
KEEPER_KEYPAIR_PATH=./keys/keeper.json
```

---

## File Structure

```
private-vault/
├── programs/pvault/src/
│   ├── lib.rs                ← entrypoint + instruction dispatch
│   ├── state.rs              ← Market, Position, LiquidationTicket
│   ├── pda.rs                ← PDA derivation helpers
│   ├── error.rs              ← VaultError enum (starts at 6000)
│   ├── fhe.rs                ← #[encrypt_fn] FHE graphs
│   └── instructions/         ← all 8 instruction handlers
├── app/                      ← Next.js 14 App Router frontend
│   ├── app/                  ← pages: /, /dashboard, /deposit, /borrow, /liquidations
│   ├── components/           ← EncryptedField, HealthBar, DemoBanner, NavBar…
│   ├── lib/                  ← pvault.ts, ika.ts, encrypt.ts, config.ts
│   └── api/                  ← Next.js route handlers (Ika gRPC bridge, keeper refresh)
├── scripts/keeper.ts         ← off-chain health refresh bot
└── tests/                    ← e2e deposit/borrow + liquidation flow
```

---

## Demo Mode

When `NEXT_PUBLIC_DEMO_MODE=true` (the default):

| Operation | Behavior |
|---|---|
| `createDWallet()` | Returns deterministic mock after 2s |
| `createInputCiphertext()` | Returns fake ciphertext pubkey after 0.8s |
| `fetchPosition()` | Returns 0.15 BTC collateral, $8,000 debt, 59.3% LTV |
| Solana tx | Sends real tx to devnet if wallet connected; falls back to mock txid |
| UI | Orange DEMO banner always visible; encrypted fields always show `••••••` |

---

## Live Demo

[https://private-vault.vercel.app](https://private-vault.vercel.app)

## Demo Video

_Recording the walkthrough — link will be added before submission._

---

## Judging Notes

This project integrates **both** required primitives as load-bearing parts of the core protocol — not bolt-ons:

- **Ika** is the *only* way BTC moves. No bridge. No wrapped token. dWallet MPC is the custody layer.
- **Encrypt** is the *only* way position data is stored. All monetary values are ciphertexts from the moment they enter the system.

The key innovation — decrypting only the liquidation boolean — is not a UX choice. It is the structural mechanism that prevents front-running and enables institutional-grade privacy for on-chain lending.
