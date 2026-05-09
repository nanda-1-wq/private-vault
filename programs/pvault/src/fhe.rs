// PrivateVault — FHE computation graphs
//
// Four `#[encrypt_fn]` graphs that run on-chain via the Encrypt executor.
// Each macro invocation generates two items:
//   1. `fn_name() -> Vec<u8>`          — serialised graph (private, callable within this module)
//   2. trait `FnNameCpi: EncryptCpi`   — Solana CPI wrapper (private trait, blanket-impl'd)
//
// The `pub fn *_graph_bytes()` wrappers below expose the serialised graphs for use in
// `cpi/encrypt.rs` (T5), which builds the execute_graph instruction manually.
//
// FHE rules enforced by the DSL compiler:
//   - Every `if` must have `else`  (compiled to ternary Select op)
//   - Both branches are always evaluated
//   - Comparison operators (>=, ==, ...) return an EUint64 with value 0 or 1
//   - EUint64 for encrypted values; PUint64 for plaintext oracle/param inputs

use encrypt_dsl::prelude::encrypt_fn;

// ---------------------------------------------------------------------------
// Graph 1 — calc_collateral_usd
// ---------------------------------------------------------------------------
// Called by: deposit_collateral, refresh_health
//
// collateral_usd_e6 = (sats * btc_price_usd_e6) / 1_0000_0000
//
// The division converts: (satoshis × price_in_microdollars_per_BTC) → micro-USDC
// Example: 1_000_000 sats × 90_000_000_000 (=$90k × 1e6) / 1e8 = 900_000_000 µUSD = $900
//
// Inputs:
//   encrypted_collateral_sats  — user's BTC in satoshis (encrypted)
//   btc_price_usd_e6           — Pyth BTC/USD price × 1e6 (plaintext)
#[encrypt_fn]
fn calc_collateral_usd(
    encrypted_collateral_sats: EUint64,
    btc_price_usd_e6: PUint64,
) -> EUint64 {
    encrypted_collateral_sats * btc_price_usd_e6 / 100_000_000
}

/// Serialised graph bytes for `calc_collateral_usd`.
/// Used by `cpi::encrypt::exec_calc_collateral_usd` in T5.
pub fn calc_collateral_usd_graph() -> alloc::vec::Vec<u8> {
    calc_collateral_usd()
}

// ---------------------------------------------------------------------------
// Graph 2 — calc_health
// ---------------------------------------------------------------------------
// Called by: borrow (pre-check), refresh_health
//
// Outputs:
//   ltv_bps       — current LTV in basis points (encrypted), e.g. 7500 = 75%
//   is_unhealthy  — 1 if ltv_bps >= liquidation_ltv_bps; 0 otherwise (encrypted)
//
// Division-by-zero guard: substitute collateral=1 when collateral is zero,
// so LTV = debt × 10_000 (enormous) → immediately unhealthy. Both branches
// of the `if` are always evaluated (compiled to Select).
//
// Inputs:
//   encrypted_collateral_usd_e6 — output of calc_collateral_usd (encrypted)
//   encrypted_debt_usdc_e6      — current debt in micro-USDC (encrypted)
//   liquidation_ltv_bps         — e.g. 8500 for 85% threshold (plaintext)
#[encrypt_fn]
fn calc_health(
    encrypted_collateral_usd_e6: EUint64,
    encrypted_debt_usdc_e6: EUint64,
    liquidation_ltv_bps: PUint64,
) -> (EUint64, EUint64) {
    // Guard: avoid division by zero — treat zero collateral as 1 micro-USD.
    let safe_col = if encrypted_collateral_usd_e6 == 0 {
        EUint64::from(1)
    } else {
        encrypted_collateral_usd_e6
    };
    // ltv_bps = (debt * 10_000) / collateral
    let debt_scaled = encrypted_debt_usdc_e6 * 10_000;
    let ltv_bps = debt_scaled / safe_col;
    // is_unhealthy: comparison returns EUint64 with value 0 or 1
    let is_unhealthy = ltv_bps >= liquidation_ltv_bps;
    (ltv_bps, is_unhealthy)
}

/// Serialised graph bytes for `calc_health`.
pub fn calc_health_graph() -> alloc::vec::Vec<u8> {
    calc_health()
}

// ---------------------------------------------------------------------------
// Graph 3 — apply_borrow
// ---------------------------------------------------------------------------
// Called by: borrow (after health gate passes)
//
// new_debt = current_debt + new_borrow_amount
//
// No overflow protection at the FHE layer — the instruction handler ensures
// borrow amount ≤ (max_borrow_ltv × collateral − current_debt) before calling.
//
// Inputs:
//   encrypted_current_debt — existing debt in micro-USDC (encrypted)
//   new_borrow_amount_e6   — amount user wants to borrow (plaintext, ≥0)
#[encrypt_fn]
fn apply_borrow(
    encrypted_current_debt: EUint64,
    new_borrow_amount_e6: PUint64,
) -> EUint64 {
    encrypted_current_debt + new_borrow_amount_e6
}

/// Serialised graph bytes for `apply_borrow`.
pub fn apply_borrow_graph() -> alloc::vec::Vec<u8> {
    apply_borrow()
}

// ---------------------------------------------------------------------------
// Graph 4 — apply_repay
// ---------------------------------------------------------------------------
// Called by: repay
//
// new_debt = max(current_debt − repay_amount, 0)
//
// Safe subtraction: if repay ≥ debt the result is 0 (fully repaid).
// Both branches of `if` are always evaluated (compiled to Select).
//
// Inputs:
//   encrypted_current_debt — current debt in micro-USDC (encrypted)
//   repay_amount_e6        — amount user is repaying (plaintext, validated by SPL transfer)
#[encrypt_fn]
fn apply_repay(
    encrypted_current_debt: EUint64,
    repay_amount_e6: PUint64,
) -> EUint64 {
    // Floor at zero: if remaining debt would go negative, return 0.
    if encrypted_current_debt >= repay_amount_e6 {
        encrypted_current_debt - repay_amount_e6
    } else {
        EUint64::from(0)
    }
}

/// Serialised graph bytes for `apply_repay`.
pub fn apply_repay_graph() -> alloc::vec::Vec<u8> {
    apply_repay()
}

// ---------------------------------------------------------------------------
// Number of encrypted inputs per graph  (used by CPI layer to build ix_data)
// ---------------------------------------------------------------------------
/// `calc_collateral_usd` has 1 encrypted input (sats). Price is plaintext.
pub const CALC_COLLATERAL_USD_NUM_INPUTS: u8 = 1;
/// `calc_health` has 2 encrypted inputs (collateral_usd, debt). LTV threshold is plaintext.
pub const CALC_HEALTH_NUM_INPUTS: u8 = 2;
/// `apply_borrow` has 1 encrypted input (current_debt). Borrow amount is plaintext.
pub const APPLY_BORROW_NUM_INPUTS: u8 = 1;
/// `apply_repay` has 1 encrypted input (current_debt). Repay amount is plaintext.
pub const APPLY_REPAY_NUM_INPUTS: u8 = 1;

extern crate alloc;
