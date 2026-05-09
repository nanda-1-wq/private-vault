/**
 * Encrypt client - thin wrapper over @encrypt.xyz/pre-alpha-solana-client.
 *
 * In DEMO_MODE all calls return fake ciphertext pubkeys after a short delay.
 * The architecture is real; the privacy guarantee is mocked (pre-alpha).
 */
import { DEMO_MODE } from './config';

export interface CiphertextResult {
  ciphertextPubkey: string; // Solana pubkey of the EUint64 account
  demo?: boolean;
}

/**
 * Create an input ciphertext for a u64 plaintext value.
 * On-chain this becomes an EUint64 account owned by the Encrypt program.
 */
export async function createInputCiphertext(
  value: bigint
): Promise<CiphertextResult> {
  if (DEMO_MODE) {
    await new Promise<void>((r) => setTimeout(r, 800));
    // Deterministic mock pubkey based on value
    const hex = value.toString(16).padStart(16, '0');
    return {
      ciphertextPubkey: 'Enc1' + hex + '1111111111111111111111111111',
      demo: true,
    };
  }

  // TODO: Live path - use @encrypt.xyz/pre-alpha-solana-client
  // import { EncryptClient } from '@encrypt.xyz/pre-alpha-solana-client';
  // const client = new EncryptClient({ endpoint: process.env.ENCRYPT_GRPC_URL });
  // const pubkey = await client.createInputCiphertext(value);
  // return { ciphertextPubkey: pubkey.toBase58() };
  throw new Error('Live Encrypt mode not yet configured');
}

/**
 * Request decryption of a ciphertext.
 * Returns the decrypted boolean (0 or 1 for health checks).
 */
export async function requestDecryption(
  ciphertextPubkey: string
): Promise<number> {
  if (DEMO_MODE) {
    await new Promise<void>((r) => setTimeout(r, 1000));
    return 0; // healthy by default in demo
  }
  throw new Error('Live Encrypt mode not yet configured');
}
