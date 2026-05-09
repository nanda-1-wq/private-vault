use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 6
/// Calls Encrypt request_decryption on encrypted_is_unhealthy ONLY.
/// Collateral and debt amounts are NEVER decrypted publicly.
/// If decrypted == 1: creates LiquidationTicket, CPI to Ika approve_message.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("TryLiquidate — T5")
}
