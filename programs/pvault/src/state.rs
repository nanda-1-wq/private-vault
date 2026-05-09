// PrivateVault — on-chain account layouts
//
// All `encrypted_*` fields are Pubkeys that POINT TO Encrypt ciphertext
// accounts (owned by the Encrypt program, 98 bytes each). The pvault program
// stores only the reference (Pubkey), never the ciphertext itself.
//
// LEN constants = bytes to request when creating accounts via system_program.
// They are NOT required to equal size_of::<T>() because Pinocchio programs
// access account data as raw byte slices, not via struct transmutation.
//
// NOTE on #[repr(C)] + u64: the compiler may add tail-padding to align the
// struct to 8 bytes in memory, making size_of > LEN. This is intentional and
// harmless — account allocation uses LEN, field access uses explicit offsets.

use pinocchio::Address;

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------
// PDA seeds: [b"market"]
// Allocation: 150 bytes
//
// Field layout (byte offsets):
//   authority            Pubkey  32   @ 0
//   usdc_mint            Pubkey  32   @ 32
//   usdc_vault           Pubkey  32   @ 64
//   pyth_btc_usd_feed    Pubkey  32   @ 96
//   liquidation_ltv_bps  u16      2   @ 128
//   max_borrow_ltv_bps   u16      2   @ 130
//   liquidation_bonus_bps u16    2    @ 132
//   _pad                 u8[2]   2    @ 134  (align total_positions to 8)
//   total_positions      u64     8    @ 136
//   bump                 u8      1    @ 144
//   _reserved            u8[5]   5    @ 145
//                                ---
//                                150
#[repr(C)]
pub struct Market {
    pub authority: Address,             // 32 — admin who can update params
    pub usdc_mint: Address,             // 32
    pub usdc_vault: Address,            // 32 — SPL token vault
    pub pyth_btc_usd_feed: Address,     // 32 — Pyth price feed account
    pub liquidation_ltv_bps: u16,      //  2 — e.g. 8500 = 85 % triggers liquidation
    pub max_borrow_ltv_bps: u16,       //  2 — e.g. 7500 = 75 % max initial borrow
    pub liquidation_bonus_bps: u16,    //  2 — e.g. 500  = 5 % bonus to liquidator
    pub _pad: [u8; 2],                 //  2 — keeps total_positions 8-byte aligned
    pub total_positions: u64,          //  8 — plaintext counter
    pub bump: u8,                      //  1
    pub _reserved: [u8; 5],            //  5
}

impl Market {
    pub const LEN: usize = 150;
    pub const SEED: &'static [u8] = b"market";
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------
// PDA seeds: [b"position", owner.as_ref()]
// Allocation: 216 bytes
//
// Field layout (byte offsets):
//   owner                     Pubkey   32  @ 0
//   dwallet                   Pubkey   32  @ 32
//   btc_deposit_address_hash  [u8;32]  32  @ 64
//   encrypted_collateral_sats Pubkey   32  @ 96
//   encrypted_debt_usdc_e6    Pubkey   32  @ 128
//   encrypted_is_unhealthy    Pubkey   32  @ 160
//   last_health_refresh_slot  u64       8  @ 192
//   status                    u8        1  @ 200
//   bump                      u8        1  @ 201
//   _reserved                 [u8;14]  14  @ 202
//                                      ---
//                                      216
#[repr(C)]
pub struct Position {
    pub owner: Address,                       // 32
    pub dwallet: Address,                     // 32 — Ika dWallet PDA (holds BTC key)
    pub btc_deposit_address_hash: [u8; 32],  // 32 — keccak256 of BTC deposit address
    // Encrypt ciphertext references (Pubkeys → ciphertext accounts)
    pub encrypted_collateral_sats: Address,   // 32 — EUint64 ciphertext
    pub encrypted_debt_usdc_e6: Address,     // 32 — EUint64 ciphertext (micro-USDC)
    pub encrypted_is_unhealthy: Address,      // 32 — EUint8 ciphertext (0 or 1)
    pub last_health_refresh_slot: u64,       //  8
    pub status: u8,                          //  1 — see STATUS_* constants below
    pub bump: u8,                            //  1
    pub _reserved: [u8; 14],                 // 14
}

impl Position {
    pub const LEN: usize = 216;
    pub const SEED: &'static [u8] = b"position";

    pub const STATUS_OPEN: u8 = 0;
    pub const STATUS_LIQUIDATING: u8 = 1;
    pub const STATUS_CLOSED: u8 = 2;
}

// ---------------------------------------------------------------------------
// LiquidationTicket
// ---------------------------------------------------------------------------
// PDA seeds: [b"liq_ticket", position_pubkey.as_ref()]
// Allocation: 106 bytes
//
// Field layout (byte offsets):
//   position          Pubkey   32  @ 0
//   message_approval  Pubkey   32  @ 32
//   btc_tx_digest     [u8;32]  32  @ 64
//   created_slot      u64       8  @ 96
//   status            u8        1  @ 104
//   bump              u8        1  @ 105
//                               ---
//                               106
#[repr(C)]
pub struct LiquidationTicket {
    pub position: Address,          // 32
    pub message_approval: Address,  // 32 — Ika MessageApproval PDA
    pub btc_tx_digest: [u8; 32],   // 32 — keccak256 of unsigned BTC tx
    pub created_slot: u64,         //  8
    pub status: u8,                //  1 — see STATUS_* constants below
    pub bump: u8,                  //  1
}

impl LiquidationTicket {
    pub const LEN: usize = 106;
    pub const SEED: &'static [u8] = b"liq_ticket";

    pub const STATUS_PENDING: u8 = 0;
    pub const STATUS_SIGNED: u8 = 1;
    pub const STATUS_BROADCAST: u8 = 2;
}
