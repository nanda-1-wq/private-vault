// Repay — discriminator 4
//
// Accepts USDC from the user, transfers it to the vault, and executes the
// apply_repay FHE graph to reduce the encrypted debt ciphertext.
//
// Accounts (in order)
//   [0] position       — PDA [b"position", owner], writable
//   [1] owner          — signer
//   [2] user_usdc_ata  — user's USDC ATA, writable (source)
//   [3] usdc_vault     — program USDC vault, writable (destination)
//   [4] debt_ct        — existing encrypted_debt_usdc_e6 ciphertext
//   [5] new_debt_ct    — writable 98-byte output ciphertext (pre-funded)
//   [6] encrypt_program
//   [7] token_program
//
// Instruction data (after discriminator byte)
//   [0..8]  repay_amount_usdc_e6 : u64 LE

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::error::ProgramError;

use crate::cpi::encrypt;
use crate::error::VaultError;
use crate::fhe;
use crate::pda::position_pda;
use crate::state::Position;
use super::token::spl_transfer;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, owner, user_usdc_ata, usdc_vault, debt_ct, new_debt_ct,
        encrypt_program, token_program] = accounts
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
    let stored_debt_ct: Address;
    let pos_status: u8;
    {
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        stored_debt_ct = Address::from(<[u8; 32]>::try_from(&pos_data[128..160]).unwrap());
        pos_status = pos_data[200];
    }

    if &stored_owner != owner.address() {
        return Err(VaultError::InvalidOwner.into());
    }
    if pos_status != Position::STATUS_OPEN {
        return Err(VaultError::PositionNotOpen.into());
    }
    if debt_ct.address() != &stored_debt_ct {
        return Err(ProgramError::InvalidAccountData);
    }

    // -----------------------------------------------------------------------
    // 3. Parse instruction data
    // -----------------------------------------------------------------------
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let repay_amount_usdc_e6 = u64::from_le_bytes(data[0..8].try_into().unwrap());

    // -----------------------------------------------------------------------
    // 4. Transfer USDC from user to vault (user signs)
    // -----------------------------------------------------------------------
    spl_transfer(user_usdc_ata, usdc_vault, owner, token_program, repay_amount_usdc_e6)?;

    // -----------------------------------------------------------------------
    // 5. Execute apply_repay FHE graph
    //    Computes: new_debt = max(current_debt - repay_amount, 0)
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[debt_ct],
        &[new_debt_ct],
        encrypt_program,
        &fhe::apply_repay_graph(),
        &[repay_amount_usdc_e6],
    )?;

    // -----------------------------------------------------------------------
    // 6. Update position: new encrypted_debt_usdc_e6 ciphertext address
    // -----------------------------------------------------------------------
    let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };
    // encrypted_debt_usdc_e6 @ 128
    pos_data_mut[128..160].copy_from_slice(new_debt_ct.address().as_ref());

    Ok(())
}
