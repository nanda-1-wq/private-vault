// PDA derivation helpers
//
// Seeds reference (must match TypeScript client exactly):
//   Market            → [b"market"]
//   Position          → [b"position", owner_pubkey]
//   LiquidationTicket → [b"liq_ticket", position_pubkey]
//   Ika CPI Authority → [b"__ika_cpi_authority"]

use pinocchio::Address;

use crate::state::{LiquidationTicket, Market, Position};

pub fn market_pda(program_id: &Address) -> (Address, u8) {
    Address::find_program_address(&[Market::SEED], program_id)
}

pub fn position_pda(owner: &Address, program_id: &Address) -> (Address, u8) {
    Address::find_program_address(&[Position::SEED, owner.as_ref()], program_id)
}

pub fn liquidation_ticket_pda(position: &Address, program_id: &Address) -> (Address, u8) {
    Address::find_program_address(&[LiquidationTicket::SEED, position.as_ref()], program_id)
}

/// The Ika CPI authority PDA — pvault signs for dWallet operations under this key.
pub fn ika_cpi_authority_pda(program_id: &Address) -> (Address, u8) {
    Address::find_program_address(&[b"__ika_cpi_authority"], program_id)
}
