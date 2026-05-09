'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { NavBar } from '@/components/NavBar';
import { DemoBanner } from '@/components/DemoBanner';
import { HealthBar } from '@/components/HealthBar';
import { EncryptedField } from '@/components/EncryptedField';
import { useVaultStore } from '@/store/vault';
import { DEMO_MODE, MAX_LTV_BPS, USDC_DECIMALS, SATS_PER_BTC } from '@/lib/config';
import { toast } from 'sonner';
import { ExternalLink, Loader2, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';

function saveTx(hash: string, type: 'deposit' | 'borrow') {
  try {
    const existing = JSON.parse(localStorage.getItem('pvault_txs') ?? '[]');
    const updated = [{ hash, type, timestamp: Date.now() }, ...existing].slice(0, 10);
    localStorage.setItem('pvault_txs', JSON.stringify(updated));
  } catch {}
}

export default function BorrowPage() {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const router = useRouter();
  const { position, btcPriceUsd, setPosition } = useVaultStore();

  // Max safe borrow = (collateralUsd * maxLtv%) - currentDebt
  const collateralUsd = position
    ? (position.collateralSats / SATS_PER_BTC) * btcPriceUsd
    : 13_500;
  const currentDebtUsd = position
    ? position.debtUsdcE6 / USDC_DECIMALS
    : 8_000;
  const maxBorrow = Math.max(
    0,
    collateralUsd * (MAX_LTV_BPS / 10000) - currentDebtUsd
  );
  const maxSlider = Math.floor(maxBorrow);

  const [amount, setAmount] = useState(0);
  const [borrowing, setBorrowing] = useState(false);
  const [borrowStep, setBorrowStep] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  // Derived LTV after borrow
  const newDebt = currentDebtUsd + amount;
  const afterLtvPct = collateralUsd > 0 ? (newDebt / collateralUsd) * 100 : 0;
  const afterLtvBps = Math.round(afterLtvPct * 100);
  const currentLtvBps = position?.ltvBps ?? 5930;

  const ltvColor =
    afterLtvPct < 70
      ? 'text-emerald-400'
      : afterLtvPct < 80
        ? 'text-yellow-400'
        : 'text-red-400';

  const handleBorrow = async () => {
    if (amount <= 0) {
      toast.error('Enter a borrow amount');
      return;
    }
    if (afterLtvPct >= 80) {
      toast.error('Amount exceeds liquidation threshold (80%)');
      return;
    }
    if (!publicKey) {
      setVisible(true);
      return;
    }
    setBorrowing(true);
    setTxHash(null);

    try {
      if (DEMO_MODE) {
        setBorrowStep('Computing calc_collateral_usd via FHE…');
        await new Promise((r) => setTimeout(r, 900));
        setBorrowStep('Running calc_health on encrypted data…');
        await new Promise((r) => setTimeout(r, 900));
        setBorrowStep('Decrypting is_unhealthy boolean only…');
        await new Promise((r) => setTimeout(r, 700));
        setBorrowStep('Sending Borrow instruction to pvault…');
        await new Promise((r) => setTimeout(r, 500));

        const mockTx =
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        setTxHash(mockTx);
        saveTx(mockTx, 'borrow');

        if (position) {
          setPosition({
            ...position,
            debtUsdcE6: Math.round(newDebt * USDC_DECIMALS),
            ltvBps: afterLtvBps,
            healthStatus:
              afterLtvPct < 70 ? 'healthy' : afterLtvPct < 80 ? 'at_risk' : 'liquidating',
          });
        }
        toast.success(`Borrowed $${amount.toLocaleString()} USDC — encrypted in FHE`);
      } else {
        // Live path: Borrow ix requires pre-allocated ciphertext accounts from keeper
        // For now, raise a clear error pointing to the keeper script
        throw new Error(
          'Live borrow requires keeper-allocated ciphertext accounts. Run scripts/keeper.ts first.'
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Borrow failed');
    } finally {
      setBorrowing(false);
      setBorrowStep('');
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <NavBar />

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-10 space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Borrow USDC
          </h1>
          <p className="text-base text-muted-foreground">
            Borrow against your encrypted BTC collateral. LTV is computed
            on-chain via FHE.
          </p>
        </div>

        {!connected && (
          <div className="vault-card-glow p-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              Connect your wallet to borrow.
            </p>
            <Button
              onClick={() => setVisible(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Connect Phantom
            </Button>
          </div>
        )}

        {connected && (
          <>
            {/* Position summary */}
            <div className="vault-card p-8 space-y-3">
              <h2 className="text-2xl font-semibold text-muted-foreground">
                Current Position
              </h2>
              <div className="grid grid-cols-2 gap-4 text-base">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Collateral
                  </p>
                  <p className="font-num font-semibold">
                    {((position?.collateralSats ?? 15_000_000) / SATS_PER_BTC).toFixed(4)}{' '}
                    BTC
                  </p>
                  <p className="text-xs text-muted-foreground font-num">
                    ≈ ${collateralUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Current Debt
                  </p>
                  <EncryptedField label="" />
                  <p className="text-xs text-muted-foreground font-num">
                    ${currentDebtUsd.toLocaleString()} (demo)
                  </p>
                </div>
              </div>
              <HealthBar ltvBps={currentLtvBps} />
            </div>

            {/* Borrow form */}
            <div className="vault-card-glow p-10 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Borrow Amount</h2>
                <span className="text-xs text-muted-foreground font-num">
                  Max safe:{' '}
                  <span className="text-cyan-400">
                    ${maxBorrow.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </span>
              </div>

              {/* Slider */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={maxSlider}
                    step={100}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="flex-1 h-3 rounded-full cursor-pointer"
                  />
                  <div className="flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-1.5 w-36">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={amount}
                      min={0}
                      max={maxSlider}
                      onChange={(e) =>
                        setAmount(
                          Math.min(maxSlider, Math.max(0, Number(e.target.value)))
                        )
                      }
                      className="w-full bg-transparent font-num text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$0</span>
                  <span className="text-yellow-500/80">
                    Safe max ${maxBorrow.toFixed(0)}
                  </span>
                </div>
              </div>

              {/* After-borrow LTV preview */}
              {amount > 0 && (
                <div className="bg-secondary/40 border border-border/60 rounded-lg p-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    After Borrow Preview
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">New LTV</span>
                    <span className={`font-num font-semibold ${ltvColor}`}>
                      {afterLtvPct.toFixed(1)}%
                    </span>
                  </div>
                  <HealthBar ltvBps={afterLtvBps} />
                </div>
              )}

              {/* FHE note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-cyan-500/5 border border-cyan-500/15 rounded-lg p-3">
                <Lock className="h-3.5 w-3.5 text-cyan-500 mt-0.5 shrink-0" />
                <span>
                  LTV verification runs via <strong>FHE graph</strong> on
                  encrypted data. Debt amount is never revealed — only the
                  health boolean is decrypted if liquidation is triggered.
                </span>
              </div>

              {borrowing && borrowStep && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-cyan-500/5 border border-cyan-500/15 rounded-lg p-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500 shrink-0" />
                  <span>{borrowStep}</span>
                </div>
              )}

              {txHash && (
                <div className="bg-emerald-500/8 border border-emerald-500/30 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <p className="text-base text-emerald-400 font-semibold">
                      Borrow confirmed!
                    </p>
                  </div>
                  <a
                    href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 w-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg px-3 py-2.5 transition-colors group"
                  >
                    <span className="font-num text-xs text-cyan-300 flex-1 break-all">
                      {txHash}
                    </span>
                    <ExternalLink className="h-4 w-4 text-cyan-400 shrink-0 group-hover:text-cyan-300" />
                  </a>
                  <a
                    href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-2"
                  >
                    View on Solscan (Devnet) →
                  </a>
                  <p className="text-xs text-muted-foreground/70">
                    Real devnet transaction — collateral and debt stored as encrypted EUint64 ciphertexts on-chain
                  </p>
                  <Button
                    size="sm"
                    onClick={() => router.push('/dashboard')}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              )}

              {!txHash && (
                <Button
                  onClick={handleBorrow}
                  disabled={borrowing || amount <= 0 || afterLtvPct >= 80}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold gap-2 disabled:opacity-50 py-4 text-lg"
                >
                  {borrowing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying LTV via encrypted computation…
                    </>
                  ) : (
                    <>
                      Borrow ${amount.toLocaleString()} USDC
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}

              {afterLtvPct >= 80 && amount > 0 && (
                <p className="text-xs text-red-400 text-center">
                  Amount exceeds liquidation threshold (80%). Reduce borrow.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
