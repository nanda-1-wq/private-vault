// PrivateVault — Pinocchio program entrypoint + instruction dispatch
//
// Instruction discriminators (first byte of ix data):
//   0  InitMarket          5  RefreshHealth
//   1  OpenPosition        6  TryLiquidate
//   2  DepositCollateral   7  CommitLiquidation
//   3  Borrow
//   4  Repay

use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
};

pub mod cpi;
pub mod error;
pub mod fhe;
pub mod instructions;
pub mod pda;
pub mod state;

// ---------------------------------------------------------------------------
// Program entrypoint
// ---------------------------------------------------------------------------
#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    let (discriminator, rest) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match discriminator {
        0 => instructions::init_market::process(program_id, accounts, rest),
        1 => instructions::open_position::process(program_id, accounts, rest),
        2 => instructions::deposit_collateral::process(program_id, accounts, rest),
        3 => instructions::borrow::process(program_id, accounts, rest),
        4 => instructions::repay::process(program_id, accounts, rest),
        5 => instructions::refresh_health::process(program_id, accounts, rest),
        6 => instructions::try_liquidate::process(program_id, accounts, rest),
        7 => instructions::commit_liquidation::process(program_id, accounts, rest),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
