use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 0
/// Accounts: market PDA (writable, signer), authority, system program
/// Data: admin pubkey (32 bytes), ltv_bps (2 bytes)
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("InitMarket — T5")
}
