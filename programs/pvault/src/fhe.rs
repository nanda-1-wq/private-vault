// FHE computation graphs compiled via encrypt-dsl — implemented in T4.
//
// Graphs:
//   calc_collateral_usd(EUint64 sats, PUint64 price)   → EUint64 usd_e6
//   calc_health(EUint64 col_usd, EUint64 debt, PUint64 ltv_bps)
//                                                       → (EUint64 ltv, EUint64 is_unhealthy)
//   apply_borrow(EUint64 current_debt, PUint64 amount)  → EUint64 new_debt
//   apply_repay(EUint64 current_debt, PUint64 amount)   → EUint64 new_debt
//
// FHE rules: every `if` must have `else`; both branches always evaluated
// (compiled to Select). No bare conditionals.
