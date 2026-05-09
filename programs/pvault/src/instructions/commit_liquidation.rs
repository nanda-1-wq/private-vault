use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 7
/// Finalises an in-flight liquidation after the Ika NOA has signed the BTC tx.
/// Closes the LiquidationTicket, resets position state.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("CommitLiquidation — T5")
}
