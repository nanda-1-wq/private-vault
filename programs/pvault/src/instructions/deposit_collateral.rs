use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

/// Discriminator: 2
/// Verifies BTC deposit on signet, stores sat amount as Encrypt EUint64 ciphertext,
/// runs calc_collateral_usd FHE graph, updates position.collateral_ciphertext.
pub fn process(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> Result<(), ProgramError> {
    todo!("DepositCollateral — T5")
}
