use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 3
/// Runs apply_borrow + calc_health FHE graphs. Mints USDC to borrower if healthy.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("Borrow — T5")
}
