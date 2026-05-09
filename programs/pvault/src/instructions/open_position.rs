// OpenPosition — discriminator 1
//
// Creates a Position PDA for the caller.  The Ika dWallet must have been
// created client-side (via DKG gRPC) and its authority transferred to the
// pvault CPI authority PDA BEFORE calling this instruction.
//
// Accounts (in order)
//   [0] position       — PDA [b"position", owner], writable, must be uninitialized
//   [1] owner          — signer (becomes position owner)
//   [2] dwallet        — Ika dWallet PDA that pvault now controls
//   [3] market         — the singleton Market PDA (readonly, validated)
//   [4] system_program
//
// Instruction data (after discriminator byte)
//   [0..32] btc_deposit_address_hash — keccak256 of the BTC deposit address

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::cpi::{Seed, Signer};
use pinocchio::error::ProgramError;
use pinocchio_system::instructions::CreateAccount;

use crate::error::VaultError;
use crate::pda::{market_pda, position_pda};
use crate::state::Position;

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, owner, dwallet, market_acc, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // -----------------------------------------------------------------------
    // 2. Validate
    // -----------------------------------------------------------------------
    if !owner.is_signer() {
        return Err(VaultError::Unauthorized.into());
    }

    // Verify market PDA
    let (expected_market, _) = market_pda(program_id);
    if market_acc.address() != &expected_market {
        return Err(ProgramError::InvalidAccountData);
    }
    if !market_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }

    // Parse btc_deposit_address_hash
    if data.len() < 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut btc_deposit_address_hash = [0u8; 32];
    btc_deposit_address_hash.copy_from_slice(&data[0..32]);

    // -----------------------------------------------------------------------
    // 3. Derive & verify Position PDA
    // -----------------------------------------------------------------------
    let (expected_position, bump) = position_pda(owner.address(), program_id);
    if position_acc.address() != &expected_position {
        return Err(ProgramError::InvalidAccountData);
    }

    // Position must not already exist
    if position_acc.lamports() != 0 {
        return Err(VaultError::PositionAlreadyOpen.into());
    }

    // -----------------------------------------------------------------------
    // 4. Create Position PDA via system_program
    // -----------------------------------------------------------------------
    let owner_key_bytes = owner.address().as_ref();
    let bump_ref = &[bump];
    let signer_seeds = [
        Seed::from(Position::SEED),
        Seed::from(owner_key_bytes),
        Seed::from(bump_ref as &[u8]),
    ];
    let pos_signer = Signer::from(&signer_seeds[..]);

    CreateAccount::with_minimum_balance(
        owner,
        position_acc,
        Position::LEN as u64,
        program_id,
        None,
    )?
    .invoke_signed(&[pos_signer])?;

    // -----------------------------------------------------------------------
    // 5. Initialise Position fields
    // -----------------------------------------------------------------------
    // Safety: we just created this account.
    let pos_data = unsafe { position_acc.borrow_unchecked_mut() };

    // owner @ 0
    pos_data[0..32].copy_from_slice(owner.address().as_ref());
    // dwallet @ 32
    pos_data[32..64].copy_from_slice(dwallet.address().as_ref());
    // btc_deposit_address_hash @ 64
    pos_data[64..96].copy_from_slice(&btc_deposit_address_hash);
    // encrypted_collateral_sats @ 96 — zero (no ciphertext yet)
    pos_data[96..128].copy_from_slice(&[0u8; 32]);
    // encrypted_debt_usdc_e6 @ 128 — zero
    pos_data[128..160].copy_from_slice(&[0u8; 32]);
    // encrypted_is_unhealthy @ 160 — zero
    pos_data[160..192].copy_from_slice(&[0u8; 32]);
    // last_health_refresh_slot @ 192 — 0
    pos_data[192..200].copy_from_slice(&0u64.to_le_bytes());
    // status @ 200 — Open
    pos_data[200] = Position::STATUS_OPEN;
    // bump @ 201
    pos_data[201] = bump;
    // _reserved @ 202 — zero

    // -----------------------------------------------------------------------
    // 6. Increment market.total_positions
    // -----------------------------------------------------------------------
    let mkt_data = unsafe { market_acc.borrow_unchecked_mut() };
    let total = u64::from_le_bytes(mkt_data[136..144].try_into().unwrap());
    mkt_data[136..144].copy_from_slice(&(total + 1).to_le_bytes());

    Ok(())
}
