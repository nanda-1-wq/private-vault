use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 4
/// Burns USDC from repayer, runs apply_repay FHE graph, updates debt ciphertext.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("Repay — T5")
}
