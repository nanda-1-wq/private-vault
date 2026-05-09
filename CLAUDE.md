# PrivateVault

Encrypted multi-chain collateral lending on Solana. Users deposit BTC from any chain via Ika dWallet MPC (bridgeless, no trusted bridge), borrow USDC on Solana, with ALL position data (collateral amounts, debt, LTV) stored as FHE ciphertexts via Encrypt's REFHE protocol. Only the liquidation health boolean is ever decrypted — position sizes stay private.

Built for: **Colosseum Frontier Hackathon — Encrypt & Ika track**
Prize: $15,000 USDC (1st: $10k, 2nd: $3k, 3rd: $1k)
Deadline: ~72 hours from project start
Submission: Superteam Earn + arena.colosseum.org

---

## Architecture in One Paragraph

Single Pinocchio program (`pvault`) on Solana devnet. User creates a Secp256k1 dWallet via Ika gRPC (DKG), transfers its authority to the pvault CPI authority PDA so only the program can sign BTC transactions. User deposits BTC to the dWallet-derived address; the sat amount is stored as an EUint64 ciphertext via Encrypt. FHE graphs (`#[encrypt_fn]`) compute LTV and health checks on encrypted data. Liquidation decrypts ONLY the boolean `is_unhealthy` — collateral and debt amounts never leave encrypted state.

---

## Critical Pre-Alpha Facts (READ BEFORE EVERY SESSION)

- **Encrypt pre-alpha**: NO real encryption. All data is plaintext on-chain. The DSL, graph compilation, and executor ARE real. Privacy guarantee is mocked — expected and acceptable for this hackathon.
- **Ika pre-alpha**: Single mock NOA signer, NOT real distributed MPC. All 11 protocol operations work end-to-end. Trust model is mocked — expected and acceptable.
- **DEMO_MODE=true** is the DEFAULT. It does not mean the architecture is fake — it means we're using stub responses instead of potentially flaky devnet gRPC endpoints. The on-chain program logic is always real.
- Both limitations must be clearly stated in README. Judges know this. It does NOT disqualify.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Solana program | Pinocchio (NOT Anchor) | 0.10 |
| Ika integration | ika-dwallet-pinocchio | git: dwallet-labs/ika-pre-alpha |
| Encrypt integration | encrypt-pinocchio + encrypt-dsl | git: dwallet-labs/encrypt-pre-alpha |
| Solana CLI | solana-cli | 3.x (required by Ika) |
| Rust edition | 2024 | nightly toolchain |
| Frontend | Next.js App Router | 14.2.x |
| Package manager | bun | 1.1+ |
| UI library | shadcn/ui + Tailwind | slate theme, dark |
| Wallet | @solana/wallet-adapter + Phantom | 0.15.x |
| Encrypt TS client | @encrypt.xyz/pre-alpha-solana-client | latest |
| Ika TS bridge | @grpc/grpc-js (custom route) | 1.10.x |
| Charts | recharts | 2.12.x |
| State | zustand | 4.x |

---

## Why Pinocchio (NOT Anchor)

Ika requires **Anchor v1** + solana-program 2.2 (Rust 2024).
Encrypt requires **Anchor v0.32** + solana-program 4.
These are **incompatible** in a single Anchor crate.
Solution: use **Pinocchio for both** — both SDKs have first-class Pinocchio support at version 0.10.

---

## Program IDs (Devnet)

| Program | ID |
|---|---|
| Ika dWallet Program | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| Encrypt Program | `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8` |
| pvault (our program) | `3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq` |

---

## gRPC Endpoints

| Service | Endpoint |
|---|---|
| Ika gRPC | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Encrypt gRPC | `https://pre-alpha-dev-1.encrypt.ika-network.net:443` |
| Solana RPC | `https://api.devnet.solana.com` |

---

## PDA Seeds (must match exactly in Rust AND TypeScript)

| Account | Seeds |
|---|---|
| Market | `[b"market"]` |
| Position | `[b"position", owner_pubkey]` |
| LiquidationTicket | `[b"liq_ticket", position_pubkey]` |
| Ika CPI Authority | `[b"__ika_cpi_authority"]` |

---

## Account Sizes

| Struct | Size (bytes) |
|---|---|
| Market | 150 |
| Position | 216 |
| LiquidationTicket | 106 |
| Encrypt ciphertext account | 98 (owned by Encrypt program) |

---

## Instruction Discriminators (first byte of ix data)

| Instruction | Discriminator |
|---|---|
| InitMarket | 0 |
| OpenPosition | 1 |
| DepositCollateral | 2 |
| Borrow | 3 |
| Repay | 4 |
| RefreshHealth | 5 |
| TryLiquidate | 6 |
| CommitLiquidation | 7 |

---

## FHE Graphs (fhe.rs)

| Function | Inputs | Output | Used in |
|---|---|---|---|
| `calc_collateral_usd` | EUint64 sats, PUint64 price | EUint64 usd_e6 | deposit, refresh_health |
| `calc_health` | EUint64 collateral_usd, EUint64 debt, PUint64 ltv_bps | (EUint64 ltv, EUint64 is_unhealthy) | borrow, refresh_health |
| `apply_borrow` | EUint64 current_debt, PUint64 new_amount | EUint64 new_debt | borrow |
| `apply_repay` | EUint64 current_debt, PUint64 repay_amount | EUint64 new_debt | repay |

**FHE rules**: every `if` must have `else`. Both branches always evaluated (compiled to `Select`). Comparison `>=` returns same encrypted type (0 or 1). No bare conditionals.

---

## Key Design Decision: Only the Boolean Gets Decrypted

In `try_liquidate`:
1. `refresh_health` executes `calc_health` graph → stores `encrypted_is_unhealthy` ciphertext
2. `try_liquidate` calls `request_decryption` on `encrypted_is_unhealthy` ONLY
3. If decrypted == 1: CPI to Ika `approve_message` → NOA signs BTC tx → liquidation executes
4. Collateral amounts and debt positions are NEVER decrypted publicly

This is the core innovation. Front-runners cannot identify which positions are near liquidation threshold.

---

## Dev Commands

```bash
# Rust program
cd programs/pvault
cargo check                          # fast type check
cargo build-sbf                      # build for Solana

# Deploy
solana config set --url devnet
solana program deploy target/deploy/pvault.so --keypair keys/deploy.json

# Frontend
cd app
bun dev                              # http://localhost:3000
bun run build                        # production build check

# Keeper (off-chain health monitor)
cd scripts
bun run keeper.ts

# Full workspace
bun run dev                          # from root
```

---

## Environment Variables

```bash
# .env.local (gitignored, never commit)
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_PVAULT_PROGRAM_ID=<set after deploy>
NEXT_PUBLIC_IKA_PROGRAM_ID=87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY
NEXT_PUBLIC_ENCRYPT_PROGRAM_ID=4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8
NEXT_PUBLIC_DEMO_MODE=true
IKA_GRPC_URL=https://pre-alpha-dev-1.ika.ika-network.net:443
ENCRYPT_GRPC_URL=https://pre-alpha-dev-1.encrypt.ika-network.net:443
PYTH_BTC_USD_FEED=<pyth devnet BTC/USD feed pubkey>
KEEPER_KEYPAIR_PATH=./keys/keeper.json
```

---

## File Structure

```
private-vault/
├── CLAUDE.md                         ← YOU ARE HERE
├── README.md                         ← written last, for judges
├── .env.example                      ← committed, no secrets
├── .env.local                        ← gitignored, real secrets
├── .gitignore
├── Cargo.toml                        ← workspace root
├── package.json                      ← bun workspace root
├── bun.lockb
├── programs/
│   └── pvault/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                ← entrypoint + instruction dispatch
│           ├── state.rs              ← Market, Position, LiquidationTicket
│           ├── pda.rs                ← PDA derivation helpers
│           ├── error.rs              ← VaultError enum (starts at 6000)
│           ├── fhe.rs                ← #[encrypt_fn] graphs
│           ├── instructions/
│           │   ├── mod.rs
│           │   ├── init_market.rs
│           │   ├── open_position.rs
│           │   ├── deposit_collateral.rs
│           │   ├── borrow.rs
│           │   ├── repay.rs
│           │   ├── refresh_health.rs
│           │   ├── try_liquidate.rs
│           │   └── commit_liquidation.rs
│           └── cpi/
│               ├── mod.rs
│               ├── ika.rs            ← thin wrappers over DWalletContext
│               └── encrypt.rs        ← thin wrappers over EncryptCpi
├── app/                              ← Next.js 14 App Router
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  ← landing / connect wallet
│   │   ├── dashboard/page.tsx
│   │   ├── deposit/page.tsx          ← 3-step wizard
│   │   ├── borrow/page.tsx
│   │   └── liquidations/page.tsx
│   ├── components/
│   │   ├── EncryptedField.tsx        ← shows •••••• with lock icon
│   │   ├── HealthBar.tsx
│   │   ├── DemoBanner.tsx
│   │   ├── BtcPrice.tsx
│   │   ├── NavBar.tsx
│   │   └── StepWizard.tsx
│   ├── lib/
│   │   ├── config.ts                 ← DEMO_MODE, program IDs
│   │   ├── pvault.ts                 ← program client (PDA derivation, ix builders)
│   │   ├── ika.ts                    ← Ika client (demo + live)
│   │   └── encrypt.ts               ← Encrypt client (demo + live)
│   ├── store/
│   │   └── vault.ts                  ← zustand store
│   ├── api/
│   │   ├── ika/dkg/route.ts          ← gRPC bridge: DKG
│   │   ├── ika/sign/route.ts         ← gRPC bridge: Sign
│   │   └── keeper/refresh/route.ts   ← cron health refresh
│   └── providers.tsx                 ← Solana wallet adapter wrapper
├── tests/
│   ├── e2e_deposit_borrow.ts
│   └── liquidation_flow.ts
├── scripts/
│   └── keeper.ts                     ← off-chain health monitor loop
└── keys/
    ├── .gitkeep
    ├── deploy.json                   ← gitignored
    └── keeper.json                   ← gitignored
```

---

## Session Rules

**Start of EVERY session:**
```
/model opusplan
```
This uses Opus 4 for planning, Sonnet for execution. Non-negotiable.

**Between major features:**
```
/clear
```
Never let context grow past ~4 major features. Context bloat causes worse code.

**What to paste in each session:**
- The ONE file currently being worked on
- The specific error message (not full terminal output)
- This CLAUDE.md (always available at project root)

**What NOT to paste:**
- Entire file trees
- Full node_modules errors
- Every file in the folder

---

## Build Order (DO NOT SKIP STEPS)

```
T1  → monorepo scaffold (Cargo.toml, package.json, .gitignore, .env.example)
T2  → state.rs (Market, Position, LiquidationTicket)
T3  → pda.rs + error.rs
T4  → fhe.rs (4 encrypt_fn graphs)
T5  → instructions/ (all 8 handlers)
T6  → cargo build-sbf + solana program deploy
T7  → Next.js scaffold + providers + store + Ika API route
T8  → all 4 pages + 6 shared components
T9  → wire program instructions to frontend (pvault.ts + encrypt.ts)
T10 → keeper.ts + QA + README + Vercel deploy + submission
```

---

## Demo Mode Behavior

When `NEXT_PUBLIC_DEMO_MODE=true`:

| Call | Demo behavior |
|---|---|
| `createDWallet()` | Returns deterministic mock dWallet + signet BTC address after 2s delay |
| `createInputCiphertext()` | Returns fake ciphertext pubkey after 0.8s |
| `fetchPosition()` | Returns: 0.15 BTC collateral, $8,000 USDC debt, LTV 59.3%, status healthy |
| BTC confirmation wait | Shows "Skip (demo)" button after 3 seconds |
| Solana tx send | Sends real tx to devnet if wallet connected; falls back to mock txid |

UI always shows DEMO_MODE orange banner. Encrypted fields always show `••••••` with 🔒 icon regardless of mode.

---

## Judging Criteria Weights (optimize in this order)

1. **Core Integration** — Ika AND Encrypt both essential to core flow (not bolted on)
2. **Innovation** — Only the boolean gets decrypted; novel liquidation privacy model
3. **Technical Execution** — Pinocchio program compiles, deploys, sends real txs
4. **Product & Commercial** — Addresses real institutional DeFi pain point
5. **Impact** — Enables private lending at scale on Solana
6. **Usability** — Dark institutional UI, 3-step deposit wizard, health bar
7. **Completeness** — Live URL + demo video + comprehensive README

---

## Known Issues & Workarounds

| Issue | Workaround |
|---|---|
| Ika gRPC flaky on devnet | `IKA_MODE=stub` env var → deterministic local mock |
| Encrypt graph execution latency multi-second | UX shows "Computing via FHE..." spinner, eventually-consistent |
| No official Ika TypeScript SDK | `/api/ika/dkg` Next.js route bridges via `@grpc/grpc-js` or shells Rust binary |
| Pyth SDK Anchor-flavored | Parse raw Pyth account bytes manually, or hardcode $90,000 mock price |
| Anchor version conflict (v1 vs v0.32) | Use Pinocchio for both — this IS the solution, not a workaround |
| BTC mainnet confirmation takes hours | Demo on Bitcoin signet. README explains mainnet works identically. |

---

## Session Log

- **Session 1**: [x] T1 scaffold complete
- **Session 2**: [x] T2-T4 Rust state + PDA + FHE graphs
- **Session 3**: [x] T5 all 8 instructions
- **Session 4**: [x] T6 build + deploy — Program ID: `3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq`
- **Session 5**: [x] T7-T8 Next.js + all pages — Landing, Dashboard, Deposit (3-step), Borrow, Liquidations + 6 shared components
- **Session 6**: [ ] T9 wire frontend to program
- **Session 7**: [ ] T10 keeper + QA + submit
