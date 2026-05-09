// SPL Token CPI helpers
//
// Raw instruction-level CPI to the SPL Token program.
// We construct the Transfer instruction manually — no wrapper crate needed.
//
// Transfer layout (SPL Token v3):
//   byte 0  : 3  (Transfer discriminator)
//   bytes 1–8: amount as u64 LE
//
// Accounts: [source_ata (writable), dest_ata (writable), authority (signer)]

use pinocchio::{
    cpi::{invoke_signed, Signer},
    instruction::{InstructionAccount, InstructionView},
    AccountView, ProgramResult,
};

/// Transfer `amount` SPL tokens from `src` to `dst`, signed by `authority`.
///
/// For program-owned vaults, use `spl_transfer_signed` with the PDA seeds.
pub fn spl_transfer(
    src: &AccountView,
    dst: &AccountView,
    authority: &AccountView,
    token_program: &AccountView,
    amount: u64,
) -> ProgramResult {
    spl_transfer_signed(src, dst, authority, token_program, amount, &[])
}

/// Transfer signed by a PDA authority.
///
/// Pass `signer_seeds` as a slice of `Signer` values (one per PDA signer).
/// Use an empty slice (`&[]`) when the authority is a wallet signer.
pub fn spl_transfer_signed(
    src: &AccountView,
    dst: &AccountView,
    authority: &AccountView,
    token_program: &AccountView,
    amount: u64,
    signer_seeds: &[Signer],
) -> ProgramResult {
    let mut data = [0u8; 9];
    data[0] = 3; // Transfer discriminator
    data[1..9].copy_from_slice(&amount.to_le_bytes());

    let accounts = [
        InstructionAccount::writable(src.address()),
        InstructionAccount::writable(dst.address()),
        InstructionAccount::readonly_signer(authority.address()),
    ];

    let ix = InstructionView {
        program_id: token_program.address(),
        accounts: &accounts,
        data: &data,
    };

    invoke_signed(&ix, &[src, dst, authority], signer_seeds)
}

