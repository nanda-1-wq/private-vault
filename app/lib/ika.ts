import { DEMO_MODE } from './config';

export interface DKGResult {
  dwalletPublicKey: string; // hex-encoded compressed secp256k1 pubkey
  dwalletPda: string;       // Solana pubkey of dWallet account (base58)
  btcAddress: string;       // P2WPKH on Bitcoin signet
  demo?: boolean;
}

export async function createDWallet(userPublicKey: string): Promise<DKGResult> {
  if (DEMO_MODE) {
    // Deterministic mock - 2s simulated DKG latency
    await new Promise<void>((r) => setTimeout(r, 2000));
    return {
      dwalletPublicKey:
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      dwalletPda: 'DWa11et' + userPublicKey.slice(0, 32),
      btcAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      demo: true,
    };
  }

  const res = await fetch('/api/ika/dkg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPublicKey }),
  });
  if (!res.ok) throw new Error(`DKG failed: ${res.statusText}`);
  return res.json();
}

export async function signBtcTx(
  dwalletPda: string,
  txDigest: string
): Promise<string> {
  if (DEMO_MODE) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    return 'DEMO_SIG_' + txDigest.slice(0, 16);
  }

  const res = await fetch('/api/ika/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dwalletPda, txDigest }),
  });
  if (!res.ok) throw new Error(`Sign failed: ${res.statusText}`);
  const { signature } = await res.json();
  return signature;
}
