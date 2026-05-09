// PrivateVault — Ika dWallet CPI wrappers
//
// Thin wrappers over the `ika-dwallet-pinocchio` pre-alpha SDK.
//
// Ika program ID (devnet): 87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY

use pinocchio::{AccountView, ProgramResult};

// ---------------------------------------------------------------------------
// approve_message
// ---------------------------------------------------------------------------
// Creates a MessageApproval PDA and instructs the Ika NOA to produce a
// Secp256k1 signature over `message_digest` using the dWallet key.
pub fn approve_message(
    dwallet: &AccountView,
    message_approval: &AccountView,
    ika_cpi_authority: &AccountView,
    caller: &AccountView,
    _ika_program: &AccountView,
    message_digest: &[u8; 32],
    hash_scheme: u8,
    cpi_authority_bump: u8,
) -> ProgramResult {
    // TODO(ika-pre-alpha): replace with actual CPI once SDK stabilises.
    //
    // Intended call:
    //   ika_dwallet_pinocchio::cpi::ApproveMessage {
    //       dwallet,
    //       message_approval,
    //       cpi_authority: ika_cpi_authority,
    //       payer: caller,
    //       message: message_digest,
    //       hash_scheme: ika_dwallet_pinocchio::HashScheme::TaprootSha256,
    //   }.invoke_signed(&[&[b"__ika_cpi_authority", &[cpi_authority_bump]]])?;
    let _ = (
        dwallet,
        message_approval,
        ika_cpi_authority,
        caller,
        message_digest,
        hash_scheme,
        cpi_authority_bump,
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// is_message_signed
// ---------------------------------------------------------------------------
// Returns true if the Ika MessageApproval account has been signed by the NOA.
//
// MessageApproval account layout (pre-alpha, approximate):
//   [0..32]  dwallet pubkey
//   [32..64] message digest
//   [64]     status: u8 (0=Pending, 1=Signed)
pub fn is_message_signed(message_approval: &AccountView) -> bool {
    // Safety: read-only access.
    let data = unsafe { message_approval.borrow_unchecked() };
    // TODO(ika-pre-alpha): verify offset 64 against final MessageApproval layout.
    if data.len() < 65 {
        return false;
    }
    data[64] == 1
}
