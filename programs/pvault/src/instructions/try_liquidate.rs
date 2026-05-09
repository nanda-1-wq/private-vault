// TryLiquidate — discriminator 6
//
// PERMISSIONLESS: any liquidator bot can call this.
//
// Decrypts ONLY the `encrypted_is_unhealthy` boolean.  If unhealthy:
//   - Builds a BTC liquidation tx digest.
//   - CPIs to Ika `approve_message` to queue an NOA signature.
//   - Creates a LiquidationTicket PDA.
//   - Sets position.status = Liquidating.
//
// Accounts (in order)
//   [0]  position           — PDA [b"position", owner], writable
//   [1]  unhealthy_ct       — encrypted_is_unhealthy ciphertext (readonly)
//   [2]  decrypt_result     — writable 16-byte account for decryption output
//   [3]  liq_ticket         — PDA [b"liq_ticket", position], writable, new
//   [4]  message_approval   — Ika MessageApproval PDA, writable, new
//   [5]  ika_cpi_authority  — pvault's Ika CPI authority PDA
//   [6]  dwallet            — Ika dWallet PDA (from position.dwallet)
//   [7]  caller             — signer (liquidator, pays for LiqTicket creation)
//   [8]  ika_program
//   [9]  encrypt_program
//   [10] system_program
//
// Instruction data: none

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio_system::instructions::CreateAccount;

use crate::cpi::{encrypt, ika};
use crate::error::VaultError;
use crate::pda::{ika_cpi_authority_pda, liquidation_ticket_pda, position_pda};
use crate::state::{LiquidationTicket, Position};

// BTC Taproot hash scheme identifier used by Ika.
const HASH_SCHEME_TAPROOT_SHA256: u8 = 0;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, unhealthy_ct, decrypt_result, liq_ticket_acc, message_approval,
        ika_cpi_authority, dwallet, caller, ika_program, encrypt_program, _system_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // -----------------------------------------------------------------------
    // 2. Validate
    // -----------------------------------------------------------------------
    if !caller.is_signer() {
        return Err(VaultError::Unauthorized.into());
    }
    if !position_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }

    let stored_owner: Address;
    let stored_unhealthy_ct: Address;
    let stored_dwallet: Address;
    let last_refresh_slot: u64;
    let pos_status: u8;
    let btc_deposit_hash: [u8; 32];
    {
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        if pos_data.len() < Position::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        stored_dwallet = Address::from(<[u8; 32]>::try_from(&pos_data[32..64]).unwrap());
        btc_deposit_hash = <[u8; 32]>::try_from(&pos_data[64..96]).unwrap();
        stored_unhealthy_ct = Address::from(<[u8; 32]>::try_from(&pos_data[160..192]).unwrap());
        last_refresh_slot = u64::from_le_bytes(pos_data[192..200].try_into().unwrap());
        pos_status = pos_data[200];
    }

    // Verify position PDA
    let (expected_pos, _) = position_pda(&stored_owner, program_id);
    if position_acc.address() != &expected_pos {
        return Err(ProgramError::InvalidAccountData);
    }
    if pos_status != Position::STATUS_OPEN {
        return Err(VaultError::PositionNotOpen.into());
    }
    if unhealthy_ct.address() != &stored_unhealthy_ct {
        return Err(ProgramError::InvalidAccountData);
    }
    if dwallet.address() != &stored_dwallet {
        return Err(ProgramError::InvalidAccountData);
    }

    // Health must have been computed at least once
    if last_refresh_slot == 0 {
        return Err(VaultError::GraphExecutionPending.into());
    }
    // TODO: compare last_refresh_slot against Clock::get()?.slot for strict staleness.

    // -----------------------------------------------------------------------
    // 3. Decrypt encrypted_is_unhealthy — ONLY this boolean is decrypted
    // -----------------------------------------------------------------------
    encrypt::request_decryption(unhealthy_ct, decrypt_result, caller, encrypt_program)?;

    let (is_unhealthy_val, result_digest) = encrypt::read_decryption_result(decrypt_result);

    // DigestMismatch: result must correspond to THIS ciphertext account
    let expected_digest = encrypt::ciphertext_digest_snapshot(unhealthy_ct);
    if result_digest != expected_digest {
        return Err(VaultError::DigestMismatch.into());
    }
    if is_unhealthy_val == 0 {
        return Err(VaultError::PositionStillHealthy.into());
    }

    // -----------------------------------------------------------------------
    // 4. Build BTC liquidation tx digest
    //    XOR-based deterministic commitment for pre-alpha demo.
    //    TODO: replace with keccak256 of a real unsigned BTC taproot tx.
    // -----------------------------------------------------------------------
    let mut btc_tx_digest = [0u8; 32];
    let pos_key = position_acc.address().as_ref();
    for i in 0..32 {
        btc_tx_digest[i] = pos_key[i] ^ btc_deposit_hash[i] ^ (i as u8);
    }

    // -----------------------------------------------------------------------
    // 5. Derive Ika CPI authority PDA and verify
    // -----------------------------------------------------------------------
    let (expected_ika_auth, ika_auth_bump) = ika_cpi_authority_pda(program_id);
    if ika_cpi_authority.address() != &expected_ika_auth {
        return Err(VaultError::DWalletNotOwnedByVault.into());
    }

    // -----------------------------------------------------------------------
    // 6. CPI to Ika: approve_message
    // -----------------------------------------------------------------------
    ika::approve_message(
        dwallet,
        message_approval,
        ika_cpi_authority,
        caller,
        ika_program,
        &btc_tx_digest,
        HASH_SCHEME_TAPROOT_SHA256,
        ika_auth_bump,
    )?;

    // -----------------------------------------------------------------------
    // 7. Create LiquidationTicket PDA
    // -----------------------------------------------------------------------
    let (expected_ticket, ticket_bump) = liquidation_ticket_pda(position_acc.address(), program_id);
    if liq_ticket_acc.address() != &expected_ticket {
        return Err(ProgramError::InvalidAccountData);
    }

    let pos_key_bytes = position_acc.address().as_ref();
    let ticket_bump_ref = &[ticket_bump];
    let ticket_seeds = [
        Seed::from(LiquidationTicket::SEED),
        Seed::from(pos_key_bytes),
        Seed::from(ticket_bump_ref as &[u8]),
    ];
    let ticket_signer = Signer::from(&ticket_seeds[..]);

    CreateAccount::with_minimum_balance(
        caller,
        liq_ticket_acc,
        LiquidationTicket::LEN as u64,
        program_id,
        None,
    )?
    .invoke_signed(&[ticket_signer])?;

    // -----------------------------------------------------------------------
    // 8. Initialise LiquidationTicket fields
    // -----------------------------------------------------------------------
    let ticket_data = unsafe { liq_ticket_acc.borrow_unchecked_mut() };
    // position @ 0
    ticket_data[0..32].copy_from_slice(position_acc.address().as_ref());
    // message_approval @ 32
    ticket_data[32..64].copy_from_slice(message_approval.address().as_ref());
    // btc_tx_digest @ 64
    ticket_data[64..96].copy_from_slice(&btc_tx_digest);
    // created_slot @ 96 — TODO: use Clock sysvar slot
    ticket_data[96..104].copy_from_slice(&last_refresh_slot.to_le_bytes());
    // status @ 104 — Pending
    ticket_data[104] = LiquidationTicket::STATUS_PENDING;
    // bump @ 105
    ticket_data[105] = ticket_bump;

    // -----------------------------------------------------------------------
    // 9. Set position.status = Liquidating
    // -----------------------------------------------------------------------
    let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };
    pos_data_mut[200] = Position::STATUS_LIQUIDATING;

    Ok(())
}
