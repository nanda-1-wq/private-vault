// RefreshHealth — discriminator 5
//
// PERMISSIONLESS: anyone (keeper daemon, liquidator bot) can call this.
//
// Reads a fresh Pyth BTC/USD price, re-executes the full health pipeline:
//   calc_collateral_usd → calc_health
// Writes the new `encrypted_is_unhealthy` ciphertext address into the position
// and updates `last_health_refresh_slot`.
//
// Accounts (in order)
//   [0] position         — PDA [b"position", owner], writable
//   [1] market           — Market PDA (readonly)
//   [2] oracle           — Pyth BTC/USD price feed (readonly)
//   [3] collateral_ct    — encrypted_collateral_sats ciphertext
//   [4] debt_ct          — encrypted_debt_usdc_e6 ciphertext
//   [5] col_usd_ct_out   — writable 98-byte output: calc_collateral_usd result
//   [6] ltv_ct_out       — writable 98-byte output: calc_health ltv_bps
//   [7] unhealthy_ct_out — writable 98-byte output: calc_health is_unhealthy
//   [8] clock_sysvar     — Solana Clock sysvar (readonly)
//   [9] encrypt_program
//
// Instruction data: none

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::error::ProgramError;

use crate::cpi::encrypt;
use crate::error::VaultError;
use crate::fhe;
use crate::pda::position_pda;
use crate::state::Position;
use super::pyth::read_btc_price_usd_e6;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, market_acc, oracle, collateral_ct, debt_ct, col_usd_ct_out,
        ltv_ct_out, unhealthy_ct_out, clock_sysvar, encrypt_program] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // -----------------------------------------------------------------------
    // 2. Validate position (permissionless — no owner signer check)
    // -----------------------------------------------------------------------
    if !position_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }
    if !market_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }

    let stored_owner: Address;
    let stored_col_ct: Address;
    let stored_debt_ct: Address;
    let pos_status: u8;
    {
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        if pos_data.len() < Position::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        stored_col_ct = Address::from(<[u8; 32]>::try_from(&pos_data[96..128]).unwrap());
        stored_debt_ct = Address::from(<[u8; 32]>::try_from(&pos_data[128..160]).unwrap());
        pos_status = pos_data[200];
    }

    // Verify position PDA from stored owner
    let (expected_pos, _) = position_pda(&stored_owner, program_id);
    if position_acc.address() != &expected_pos {
        return Err(ProgramError::InvalidAccountData);
    }
    if pos_status != Position::STATUS_OPEN {
        return Err(VaultError::PositionNotOpen.into());
    }

    // Validate provided ciphertext accounts
    if collateral_ct.address() != &stored_col_ct {
        return Err(ProgramError::InvalidAccountData);
    }
    if !encrypt::is_null_ciphertext(&stored_debt_ct) && debt_ct.address() != &stored_debt_ct {
        return Err(ProgramError::InvalidAccountData);
    }

    // -----------------------------------------------------------------------
    // 3. Read Pyth price and market liquidation threshold
    // -----------------------------------------------------------------------
    let btc_price_usd_e6 = read_btc_price_usd_e6(oracle, market_acc)?;
    let liquidation_ltv_bps: u64 = {
        let mkt = unsafe { market_acc.borrow_unchecked() };
        u16::from_le_bytes([mkt[128], mkt[129]]) as u64
    };

    // -----------------------------------------------------------------------
    // 4. Execute calc_collateral_usd
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[collateral_ct],
        &[col_usd_ct_out],
        encrypt_program,
        &fhe::calc_collateral_usd_graph(),
        &[btc_price_usd_e6],
    )?;

    // -----------------------------------------------------------------------
    // 5. Execute calc_health
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[col_usd_ct_out, debt_ct],
        &[ltv_ct_out, unhealthy_ct_out],
        encrypt_program,
        &fhe::calc_health_graph(),
        &[liquidation_ltv_bps],
    )?;

    // -----------------------------------------------------------------------
    // 6. Read current slot from Clock sysvar
    //    Clock layout: slot:u64 @ 0
    // -----------------------------------------------------------------------
    let current_slot: u64 = {
        let clock_data = unsafe { clock_sysvar.borrow_unchecked() };
        if clock_data.len() >= 8 {
            u64::from_le_bytes(clock_data[0..8].try_into().unwrap_or([0u8; 8]))
        } else {
            0
        }
    };

    // -----------------------------------------------------------------------
    // 7. Write updated ciphertext address and slot into position
    // -----------------------------------------------------------------------
    let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };

    // encrypted_is_unhealthy @ 160
    pos_data_mut[160..192].copy_from_slice(unhealthy_ct_out.address().as_ref());
    // last_health_refresh_slot @ 192
    pos_data_mut[192..200].copy_from_slice(&current_slot.to_le_bytes());

    Ok(())
}
