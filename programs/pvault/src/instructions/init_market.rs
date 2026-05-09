// InitMarket — discriminator 0
//
// Creates the singleton Market PDA, initialises all governance parameters.
//
// Accounts (in order)
//   [0] market        — PDA [b"market"], writable, must be uninitialized
//   [1] authority     — signer (becomes market admin)
//   [2] usdc_mint     — the USDC mint this market accepts
//   [3] usdc_vault    — SPL token vault that holds USDC
//   [4] pyth_feed     — Pyth BTC/USD price feed account
//   [5] system_program
//
// Instruction data (after discriminator byte)
//   [0..2]  liquidation_ltv_bps   : u16 LE
//   [2..4]  max_borrow_ltv_bps    : u16 LE
//   [4..6]  liquidation_bonus_bps : u16 LE

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio_system::instructions::CreateAccount;

use crate::error::VaultError;
use crate::pda::market_pda;
use crate::state::Market;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [market_acc, authority, usdc_mint, usdc_vault, pyth_feed, _system_program] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // -----------------------------------------------------------------------
    // 2. Validate authority is signer
    // -----------------------------------------------------------------------
    if !authority.is_signer() {
        return Err(VaultError::Unauthorized.into());
    }

    // -----------------------------------------------------------------------
    // 3. Parse instruction data
    // -----------------------------------------------------------------------
    if data.len() < 6 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let liquidation_ltv_bps = u16::from_le_bytes([data[0], data[1]]);
    let max_borrow_ltv_bps = u16::from_le_bytes([data[2], data[3]]);
    let liquidation_bonus_bps = u16::from_le_bytes([data[4], data[5]]);

    // -----------------------------------------------------------------------
    // 4. Derive & verify Market PDA
    // -----------------------------------------------------------------------
    let (expected_market, bump) = market_pda(program_id);
    if market_acc.address() != &expected_market {
        return Err(ProgramError::InvalidAccountData);
    }

    // Market must not already exist
    if market_acc.lamports() != 0 {
        return Err(VaultError::PositionAlreadyOpen.into());
    }

    // -----------------------------------------------------------------------
    // 5. Create the Market PDA account via system_program
    // -----------------------------------------------------------------------
    let bump_ref = &[bump];
    let signer_seeds = [Seed::from(Market::SEED), Seed::from(bump_ref as &[u8])];
    let market_signer = Signer::from(&signer_seeds[..]);

    CreateAccount::with_minimum_balance(
        authority,
        market_acc,
        Market::LEN as u64,
        program_id,
        None, // use Rent::get() syscall
    )?
    .invoke_signed(&[market_signer])?;

    // -----------------------------------------------------------------------
    // 6. Initialise Market fields
    // -----------------------------------------------------------------------
    // Safety: we just created this account and own it; no other reference exists.
    let market_data = unsafe { market_acc.borrow_unchecked_mut() };

    // authority @ 0
    market_data[0..32].copy_from_slice(authority.address().as_ref());
    // usdc_mint @ 32
    market_data[32..64].copy_from_slice(usdc_mint.address().as_ref());
    // usdc_vault @ 64
    market_data[64..96].copy_from_slice(usdc_vault.address().as_ref());
    // pyth_btc_usd_feed @ 96
    market_data[96..128].copy_from_slice(pyth_feed.address().as_ref());
    // liquidation_ltv_bps @ 128
    market_data[128..130].copy_from_slice(&liquidation_ltv_bps.to_le_bytes());
    // max_borrow_ltv_bps @ 130
    market_data[130..132].copy_from_slice(&max_borrow_ltv_bps.to_le_bytes());
    // liquidation_bonus_bps @ 132
    market_data[132..134].copy_from_slice(&liquidation_bonus_bps.to_le_bytes());
    // _pad @ 134 — zero (zeroed by system_program::create_account)
    // total_positions @ 136 — 0
    market_data[136..144].copy_from_slice(&0u64.to_le_bytes());
    // bump @ 144
    market_data[144] = bump;
    // _reserved @ 145 — zero

    Ok(())
}
