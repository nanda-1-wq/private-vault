// PrivateVault — Encrypt CPI wrappers
//
// Thin wrappers over the `encrypt-pinocchio` pre-alpha SDK.
// Because the pre-alpha API surface may shift, each function contains a TODO
// with the INTENT clearly documented.
//
// Encrypt program ID (devnet): 4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8

use pinocchio::{AccountView, Address, ProgramResult};

// ---------------------------------------------------------------------------
// create_input_ciphertext
// ---------------------------------------------------------------------------
// Calls the Encrypt program to allocate a new EUint64 ciphertext account that
// holds `plaintext_value` (pre-alpha: stored in plaintext on-chain).
pub fn create_input_ciphertext(
    ciphertext_out: &AccountView,
    payer: &AccountView,
    _encrypt_program: &AccountView,
    plaintext_value: u64,
) -> ProgramResult {
    // TODO(encrypt-pre-alpha): replace with actual CPI once SDK stabilises.
    //
    // Intended call:
    //   encrypt_pinocchio::cpi::CreateInputCiphertext {
    //       ciphertext: ciphertext_out,
    //       payer,
    //       value: encrypt_types::EUint64::from(plaintext_value),
    //   }.invoke()?;
    let _ = (ciphertext_out, payer, plaintext_value);
    Ok(())
}

// ---------------------------------------------------------------------------
// execute_graph
// ---------------------------------------------------------------------------
// Runs a serialised FHE graph against one or more input ciphertext accounts,
// writing each output to a freshly-allocated ciphertext account.
pub fn execute_graph(
    inputs: &[&AccountView],
    outputs: &[&AccountView],
    _encrypt_program: &AccountView,
    graph_bytes: &[u8],
    plaintext_params: &[u64],
) -> ProgramResult {
    // TODO(encrypt-pre-alpha): replace with actual CPI.
    //
    // Intended call:
    //   encrypt_pinocchio::cpi::ExecuteGraph {
    //       graph: graph_bytes,
    //       inputs,
    //       outputs,
    //       plaintext_params,
    //   }.invoke()?;
    let _ = (inputs, outputs, graph_bytes, plaintext_params);
    Ok(())
}

// ---------------------------------------------------------------------------
// request_decryption
// ---------------------------------------------------------------------------
// Asks the Encrypt network to decrypt a single ciphertext.
// ONLY called for `encrypted_is_unhealthy`.
pub fn request_decryption(
    ciphertext: &AccountView,
    decryption_result: &AccountView,
    requester: &AccountView,
    _encrypt_program: &AccountView,
) -> ProgramResult {
    // TODO(encrypt-pre-alpha): replace with actual CPI.
    let _ = (ciphertext, decryption_result, requester);
    Ok(())
}

// ---------------------------------------------------------------------------
// read_decryption_result
// ---------------------------------------------------------------------------
// Reads the plaintext u64 from `result_account` after request_decryption.
//
// Layout of decryption result account (pre-alpha):
//   [0..8]  — plaintext value (u64 LE)
//   [8..16] — ciphertext pubkey digest (first 8 bytes)
pub fn read_decryption_result(result_account: &AccountView) -> (u64, [u8; 8]) {
    // Safety: read-only access, no aliasing.
    let data = unsafe { result_account.borrow_unchecked() };
    if data.len() < 16 {
        return (0, [0u8; 8]);
    }
    let value = u64::from_le_bytes(data[0..8].try_into().unwrap_or([0u8; 8]));
    let digest_snapshot: [u8; 8] = data[8..16].try_into().unwrap_or([0u8; 8]);
    (value, digest_snapshot)
}

// ---------------------------------------------------------------------------
// ciphertext_digest_snapshot
// ---------------------------------------------------------------------------
// Returns the first 8 bytes of the ciphertext account's address —
// used as the "digest" for DigestMismatch validation.
pub fn ciphertext_digest_snapshot(ciphertext: &AccountView) -> [u8; 8] {
    let key_bytes = ciphertext.address().as_ref();
    let mut snap = [0u8; 8];
    snap.copy_from_slice(&key_bytes[..8]);
    snap
}

// ---------------------------------------------------------------------------
// write_ciphertext_ref
// ---------------------------------------------------------------------------
// Writes the output ciphertext address into `dest_field` (a 32-byte slice
// within account data).
pub fn write_ciphertext_ref(dest_field: &mut [u8], ciphertext: &AccountView) {
    dest_field.copy_from_slice(ciphertext.address().as_ref());
}

/// Returns true if the address is the zero pubkey (no ciphertext yet).
pub fn is_null_ciphertext(addr: &Address) -> bool {
    addr.as_ref().iter().all(|&b| b == 0)
}
