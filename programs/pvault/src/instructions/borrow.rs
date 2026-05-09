// Borrow — discriminator 3
//
// Lends USDC from the vault, gated by an FHE health check.
// Only the `is_unhealthy` boolean ciphertext is decrypted — collateral and
// debt amounts remain encrypted throughout.
//
// Accounts (in order)
//   [0]  position        — PDA [b"position", owner], writable
//   [1]  owner           — signer
//   [2]  market          — Market PDA (readonly)
//   [3]  user_usdc_ata   — user's USDC ATA, writable
//   [4]  usdc_vault      — program USDC vault, writable
//   [5]  oracle          — Pyth BTC/USD price feed (readonly)
//   [6]  collateral_ct   — encrypted_collateral_sats ciphertext
//   [7]  col_usd_ct_out  — writable 98-byte output: calc_collateral_usd result
//   [8]  health_ltv_ct   — writable 98-byte output: calc_health ltv_bps
//   [9]  unhealthy_ct    — writable 98-byte output: calc_health is_unhealthy
//   [10] debt_ct         — encrypted_debt_usdc_e6 ciphertext
//   [11] new_debt_ct     — writable 98-byte output: apply_borrow result
//   [12] decrypt_result  — writable 16-byte account for decryption result
//   [13] encrypt_program
//   [14] token_program   — SPL Token program
//   [15] vault_authority — CPI authority PDA for signing token transfer
//
// Instruction data (after discriminator byte)
//   [0..8]  borrow_amount_usdc_e6 : u64 LE

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::error::ProgramError;

use crate::cpi::encrypt;
use crate::error::VaultError;
use crate::fhe;
use crate::pda::position_pda;
use crate::state::Position;
use super::pyth::read_btc_price_usd_e6;
use super::token::spl_transfer;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, owner, market_acc, user_usdc_ata, usdc_vault, oracle, collateral_ct,
        col_usd_ct_out, health_ltv_ct, unhealthy_ct, debt_ct, new_debt_ct, decrypt_result,
        encrypt_program, token_program, vault_authority] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // -----------------------------------------------------------------------
    // 2. Validate
    // -----------------------------------------------------------------------
    if !owner.is_signer() {
        return Err(VaultError::Unauthorized.into());
    }

    let (expected_pos, _) = position_pda(owner.address(), program_id);
    if position_acc.address() != &expected_pos {
        return Err(ProgramError::InvalidAccountData);
    }
    if !position_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }

    let stored_owner: Address;
    let pos_status: u8;
    let stored_col_ct: Address;
    let stored_debt_ct: Address;
    {
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        stored_col_ct = Address::from(<[u8; 32]>::try_from(&pos_data[96..128]).unwrap());
        stored_debt_ct = Address::from(<[u8; 32]>::try_from(&pos_data[128..160]).unwrap());
        pos_status = pos_data[200];
    }

    if &stored_owner != owner.address() {
        return Err(VaultError::InvalidOwner.into());
    }
    if pos_status != Position::STATUS_OPEN {
        return Err(VaultError::PositionNotOpen.into());
    }
    if encrypt::is_null_ciphertext(&stored_col_ct) {
        return Err(VaultError::InsufficientCollateral.into());
    }
    // Validate provided ciphertext accounts match position
    if collateral_ct.address() != &stored_col_ct {
        return Err(ProgramError::InvalidAccountData);
    }
    if !encrypt::is_null_ciphertext(&stored_debt_ct) && debt_ct.address() != &stored_debt_ct {
        return Err(ProgramError::InvalidAccountData);
    }

    // -----------------------------------------------------------------------
    // 3. Parse instruction data
    // -----------------------------------------------------------------------
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let borrow_amount_usdc_e6 = u64::from_le_bytes(data[0..8].try_into().unwrap());

    // -----------------------------------------------------------------------
    // 4. Read Pyth price + market params
    // -----------------------------------------------------------------------
    let btc_price_usd_e6 = read_btc_price_usd_e6(oracle, market_acc)?;
    let liquidation_ltv_bps: u64 = {
        let mkt = unsafe { market_acc.borrow_unchecked() };
        u16::from_le_bytes([mkt[128], mkt[129]]) as u64
    };

    // -----------------------------------------------------------------------
    // 5. Execute calc_collateral_usd  (sats → USD ciphertext)
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[collateral_ct],
        &[col_usd_ct_out],
        encrypt_program,
        &fhe::calc_collateral_usd_graph(),
        &[btc_price_usd_e6],
    )?;

    // -----------------------------------------------------------------------
    // 6. Execute calc_health with proposed new debt
    //    The executor adds borrow_amount_usdc_e6 (plaintext) to the encrypted
    //    current_debt before computing the health check.
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[col_usd_ct_out, debt_ct],
        &[health_ltv_ct, unhealthy_ct],
        encrypt_program,
        &fhe::calc_health_graph(),
        &[borrow_amount_usdc_e6, liquidation_ltv_bps],
    )?;

    // -----------------------------------------------------------------------
    // 7. Decrypt is_unhealthy ONLY
    // -----------------------------------------------------------------------
    encrypt::request_decryption(unhealthy_ct, decrypt_result, owner, encrypt_program)?;

    let (is_unhealthy_val, result_digest) = encrypt::read_decryption_result(decrypt_result);

    let expected_digest = encrypt::ciphertext_digest_snapshot(unhealthy_ct);
    if result_digest != expected_digest {
        return Err(VaultError::DigestMismatch.into());
    }
    if is_unhealthy_val != 0 {
        return Err(VaultError::BorrowExceedsMaxLtv.into());
    }

    // -----------------------------------------------------------------------
    // 8. Execute apply_borrow — update encrypted debt
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[debt_ct],
        &[new_debt_ct],
        encrypt_program,
        &fhe::apply_borrow_graph(),
        &[borrow_amount_usdc_e6],
    )?;

    // -----------------------------------------------------------------------
    // 9. Transfer USDC from vault to user
    //    vault_authority is a program PDA; TODO: wire invoke_signed with seeds.
    // -----------------------------------------------------------------------
    spl_transfer(usdc_vault, user_usdc_ata, vault_authority, token_program, borrow_amount_usdc_e6)?;

    // -----------------------------------------------------------------------
    // 10. Update position: new encrypted_debt_usdc_e6 ciphertext address
    // -----------------------------------------------------------------------
    let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };
    // encrypted_debt_usdc_e6 @ 128
    pos_data_mut[128..160].copy_from_slice(new_debt_ct.address().as_ref());

    Ok(())
}
