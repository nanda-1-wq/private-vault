export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  process.env.NODE_ENV === 'development';

export const PVAULT_PROGRAM_ID =
  process.env.NEXT_PUBLIC_PVAULT_PROGRAM_ID ||
  '3YUVeWXTZSNPuLktLZKNRtLCNXpv5JrHj3krhVMMv8iq';

export const IKA_PROGRAM_ID = '87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY';
export const ENCRYPT_PROGRAM_ID =
  '4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8';
export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';

// LTV params (must match on-chain constants)
export const MAX_LTV_BPS = 7000; // 70%
export const LIQ_THRESHOLD_BPS = 8000; // 80%

// BTC decimals
export const SATS_PER_BTC = 100_000_000;
// USDC decimals (6)
export const USDC_DECIMALS = 1_000_000;
