use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 5
/// Re-runs calc_health with fresh Pyth BTC price. Updates encrypted_is_unhealthy
/// ciphertext on the position. Called by the keeper daemon.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("RefreshHealth — T5")
}
