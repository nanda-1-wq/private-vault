import { create } from 'zustand';

export type HealthStatus = 'healthy' | 'at_risk' | 'liquidating' | 'unknown';

export interface Position {
  dwalletPda: string;
  btcAddress: string;
  /** plaintext only in demo mode - always 0 in live mode (encrypted) */
  collateralSats: number;
  /** plaintext only in demo mode - always 0 in live mode (encrypted) */
  debtUsdcE6: number;
  healthStatus: HealthStatus;
  ltvBps: number;
  status: 'open' | 'liquidating' | 'closed';
  encCollateralPubkey: string;
  encDebtPubkey: string;
}

interface VaultStore {
  position: Position | null;
  btcPriceUsd: number;
  isLoading: boolean;

  setPosition: (p: Position | null) => void;
  setBtcPrice: (price: number) => void;
  setLoading: (v: boolean) => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  position: null,
  btcPriceUsd: 90_000,
  isLoading: false,

  setPosition: (position) => set({ position }),
  setBtcPrice: (btcPriceUsd) => set({ btcPriceUsd }),
  setLoading: (isLoading) => set({ isLoading }),
}));
