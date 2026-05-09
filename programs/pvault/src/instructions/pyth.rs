// Pyth price feed reader
//
// Parses raw Pyth BTC/USD price account bytes.  Falls back to a mock price
// of $90,000 (= 90_000 × 1_000_000 µUSD) if the data does not parse.
//
// Pyth V2 Price account layout (abbreviated):
//   [0..4]   magic    : u32  — 0xa1b2c3d4
//   [20..24] expo     : i32  — negative exponent (e.g. -8 → × 10⁻⁸)
//   [208..216] price  : i64
//   [224..228] status : u32  — 1 = Trading

use pinocchio::AccountView;
use pinocchio::error::ProgramError;

use crate::error::VaultError;

/// Mock BTC price: $90,000 expressed as micro-USD (× 1e6).
const MOCK_BTC_PRICE_USD_E6: u64 = 90_000 * 1_000_000;

/// Pyth V2 magic number.
const PYTH_MAGIC: u32 = 0xa1b2c3d4;

/// Returns BTC/USD price as micro-USD (price × 1_000_000).
/// Validates that `oracle` matches the pyth_feed stored in `market`.
pub fn read_btc_price_usd_e6(
    oracle: &AccountView,
    market: &AccountView,
) -> Result<u64, ProgramError> {
    // Validate oracle address against what the market admin registered.
    // Safety: read-only access to market data.
    let mkt = unsafe { market.borrow_unchecked() };
    if mkt.len() < 128 {
        return Err(VaultError::InvalidOracle.into());
    }
    let expected_feed = &mkt[96..128]; // pyth_btc_usd_feed @ 96
    if oracle.address().as_ref() != expected_feed {
        return Err(VaultError::InvalidOracle.into());
    }

    // Safety: read-only access to oracle data.
    let oracle_data = unsafe { oracle.borrow_unchecked() };
    Ok(parse_pyth_price(oracle_data).unwrap_or(MOCK_BTC_PRICE_USD_E6))
}

/// Attempt to parse the Pyth V2 price account and return price × 1e6.
fn parse_pyth_price(data: &[u8]) -> Option<u64> {
    if data.len() < 232 {
        return None;
    }

    let magic = u32::from_le_bytes(data[0..4].try_into().ok()?);
    if magic != PYTH_MAGIC {
        return None;
    }

    let expo = i32::from_le_bytes(data[20..24].try_into().ok()?);
    let price_raw = i64::from_le_bytes(data[208..216].try_into().ok()?);
    if price_raw <= 0 {
        return None;
    }

    let status = u32::from_le_bytes(data[224..228].try_into().ok()?);
    if status != 1 {
        return None;
    }

    // Convert price to micro-USD: price_raw × 10^expo × 1e6
    // For BTC/USD expo≈-8: price_raw≈9_000_000_000_000, result≈90_000_000_000
    let price_usd_e6: u64 = if expo >= 0 {
        (price_raw as u64)
            .checked_mul(10u64.checked_pow(expo as u32)?)?
            .checked_mul(1_000_000)?
    } else {
        let divisor = 10u64.checked_pow((-expo) as u32)?;
        (price_raw as u64)
            .checked_mul(1_000_000)?
            .checked_div(divisor)?
    };

    if price_usd_e6 == 0 {
        return None;
    }

    Some(price_usd_e6)
}
