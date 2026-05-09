// VaultError — custom program error codes starting at 6000
//
// Offset from 6000 avoids collision with system program errors and gives
// clear attribution when surfaced in transaction logs.

use pinocchio::error::ProgramError;

#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VaultError {
    // -----------------------------------------------------------------------
    // Auth (6000–6009)
    // -----------------------------------------------------------------------
    Unauthorized       = 6000,
    InvalidOwner       = 6001,

    // -----------------------------------------------------------------------
    // Position state (6010–6019)
    // -----------------------------------------------------------------------
    PositionAlreadyOpen        = 6010,
    PositionNotOpen            = 6011,
    PositionAlreadyLiquidating = 6012,

    // -----------------------------------------------------------------------
    // LTV / borrow (6020–6029)
    // -----------------------------------------------------------------------
    BorrowExceedsMaxLtv    = 6020,
    InsufficientCollateral = 6021,

    // -----------------------------------------------------------------------
    // Liquidation (6030–6039)
    // -----------------------------------------------------------------------
    PositionStillHealthy        = 6030,
    LiquidationTicketNotPending = 6031,
    MessageApprovalNotSigned    = 6032,
    DigestMismatch              = 6033,

    // -----------------------------------------------------------------------
    // Oracle (6040–6049)
    // -----------------------------------------------------------------------
    StalePriceData = 6040,
    InvalidOracle  = 6041,

    // -----------------------------------------------------------------------
    // FHE / Encrypt (6050–6059)
    // -----------------------------------------------------------------------
    CiphertextTypeMismatch = 6050,
    GraphExecutionPending  = 6051,
    DecryptionNotReady     = 6052,

    // -----------------------------------------------------------------------
    // Ika (6060–6069)
    // -----------------------------------------------------------------------
    DWalletNotOwnedByVault = 6060,
    SignatureNotReady      = 6061,
}

impl From<VaultError> for u32 {
    fn from(e: VaultError) -> u32 {
        e as u32
    }
}

impl From<VaultError> for ProgramError {
    fn from(e: VaultError) -> ProgramError {
        ProgramError::Custom(e as u32)
    }
}
