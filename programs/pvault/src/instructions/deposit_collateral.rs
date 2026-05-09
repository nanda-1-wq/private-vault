// DepositCollateral — discriminator 2
//
// Records BTC deposit into the dWallet-derived address.  Stores the sat amount
// as an Encrypt EUint64 ciphertext.
//
// Accounts (in order)
//   [0] position          — PDA [b"position", owner], writable
//   [1] owner             — signer
//   [2] collateral_ct     — writable 98-byte ciphertext account (pre-funded)
//   [3] collateral_usd_ct — writable 98-byte output ciphertext (pre-funded)
//   [4] market            — Market PDA (readonly)
//   [5] oracle            — Pyth BTC/USD price feed (readonly)
//   [6] encrypt_program
//
// Instruction data (after discriminator byte)
//   [0..8]  collateral_sats : u64 LE

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
    data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, owner, collateral_ct, collateral_usd_ct, market_acc, oracle,
        encrypt_program] = accounts
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

    // Read position data
    let stored_owner: Address;
    let pos_status: u8;
    {
        // Safety: read-only, no other mutable borrow exists.
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        pos_status = pos_data[200];
    }

    if &stored_owner != owner.address() {
        return Err(VaultError::InvalidOwner.into());
    }
    if pos_status != Position::STATUS_OPEN {
        return Err(VaultError::PositionNotOpen.into());
    }

    // -----------------------------------------------------------------------
    // 3. Parse instruction data
    // -----------------------------------------------------------------------
    if data.len() < 8 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let collateral_sats = u64::from_le_bytes(data[0..8].try_into().unwrap());

    // -----------------------------------------------------------------------
    // 4. Create EUint64 input ciphertext for collateral_sats via Encrypt CPI
    // -----------------------------------------------------------------------
    encrypt::create_input_ciphertext(collateral_ct, owner, encrypt_program, collateral_sats)?;

    // -----------------------------------------------------------------------
    // 5. Read fresh BTC price from Pyth oracle
    // -----------------------------------------------------------------------
    let btc_price_usd_e6 = read_btc_price_usd_e6(oracle, market_acc)?;

    // -----------------------------------------------------------------------
    // 6. Execute calc_collateral_usd graph via Encrypt CPI
    //    Inputs:  [collateral_ct]
    //    Outputs: [collateral_usd_ct]
    //    Params:  [btc_price_usd_e6]
    // -----------------------------------------------------------------------
    encrypt::execute_graph(
        &[collateral_ct],
        &[collateral_usd_ct],
        encrypt_program,
        &fhe::calc_collateral_usd_graph(),
        &[btc_price_usd_e6],
    )?;

    // -----------------------------------------------------------------------
    // 7. Store collateral ciphertext pubkey in position
    //
    // NOTE: collateral_usd_ct is computed transiently here; refresh_health
    // recomputes it from the sats ciphertext + fresh price so we never store
    // a stale USD value.
    // -----------------------------------------------------------------------
    let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };
    // encrypted_collateral_sats @ 96
    pos_data_mut[96..128].copy_from_slice(collateral_ct.address().as_ref());

    Ok(())
}
