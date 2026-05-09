// CommitLiquidation — discriminator 7
//
// Finalises a pending liquidation after the Ika NOA has signed the BTC tx.
// Validates MessageApproval is Signed, marks LiquidationTicket as Broadcast,
// and closes the Position.
//
// Anyone can call this once the NOA signature is available (permissionless).
//
// Accounts (in order)
//   [0] position          — PDA [b"position", owner], writable
//   [1] liq_ticket        — PDA [b"liq_ticket", position], writable
//   [2] message_approval  — Ika MessageApproval PDA (readonly)
//   [3] caller            — signer (pays tx fee; no authority required)
//
// Instruction data: none

use pinocchio::{AccountView, Address, ProgramResult};
use pinocchio::error::ProgramError;

use crate::cpi::ika;
use crate::error::VaultError;
use crate::pda::{liquidation_ticket_pda, position_pda};
use crate::state::{LiquidationTicket, Position};

pub fn process(
    program_id: &Address,
    accounts: &[AccountView],
    _data: &[u8],
) -> ProgramResult {
    // -----------------------------------------------------------------------
    // 1. Unpack accounts
    // -----------------------------------------------------------------------
    let [position_acc, liq_ticket_acc, message_approval, caller] = accounts else {
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
    if !liq_ticket_acc.owned_by(program_id) {
        return Err(ProgramError::InvalidAccountData);
    }

    let stored_owner: Address;
    let pos_status: u8;
    {
        let pos_data = unsafe { position_acc.borrow_unchecked() };
        if pos_data.len() < Position::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        stored_owner = Address::from(<[u8; 32]>::try_from(&pos_data[0..32]).unwrap());
        pos_status = pos_data[200];
    }

    // Verify position PDA
    let (expected_pos, _) = position_pda(&stored_owner, program_id);
    if position_acc.address() != &expected_pos {
        return Err(ProgramError::InvalidAccountData);
    }
    // Position must be in Liquidating state (set by try_liquidate)
    if pos_status != Position::STATUS_LIQUIDATING {
        return Err(VaultError::PositionNotOpen.into());
    }

    // Verify LiquidationTicket PDA
    let (expected_ticket, _) = liquidation_ticket_pda(position_acc.address(), program_id);
    if liq_ticket_acc.address() != &expected_ticket {
        return Err(ProgramError::InvalidAccountData);
    }

    let ticket_status: u8;
    let stored_approval: Address;
    {
        let ticket_data = unsafe { liq_ticket_acc.borrow_unchecked() };
        if ticket_data.len() < LiquidationTicket::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        stored_approval = Address::from(<[u8; 32]>::try_from(&ticket_data[32..64]).unwrap());
        ticket_status = ticket_data[104];
    }

    if ticket_status != LiquidationTicket::STATUS_PENDING {
        return Err(VaultError::LiquidationTicketNotPending.into());
    }
    if message_approval.address() != &stored_approval {
        return Err(ProgramError::InvalidAccountData);
    }

    // -----------------------------------------------------------------------
    // 3. Verify Ika MessageApproval is Signed
    // -----------------------------------------------------------------------
    if !ika::is_message_signed(message_approval) {
        return Err(VaultError::MessageApprovalNotSigned.into());
    }

    // -----------------------------------------------------------------------
    // 4. Mark LiquidationTicket as Broadcast
    // -----------------------------------------------------------------------
    {
        let ticket_data_mut = unsafe { liq_ticket_acc.borrow_unchecked_mut() };
        ticket_data_mut[104] = LiquidationTicket::STATUS_BROADCAST;
    }

    // -----------------------------------------------------------------------
    // 5. Close the Position — mark Closed
    // -----------------------------------------------------------------------
    {
        let pos_data_mut = unsafe { position_acc.borrow_unchecked_mut() };
        pos_data_mut[200] = Position::STATUS_CLOSED;
    }

    // NOTE: "LiquidationComplete" event is emitted by the client after observing
    // this instruction succeed on-chain.  On-chain logging is SBF-only and would
    // require a separate crate (solana-program-log) not in our dep tree.

    Ok(())
}
