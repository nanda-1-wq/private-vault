'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { Button } from '@/components/ui/button';
import { NavBar } from '@/components/NavBar';
import { DemoBanner } from '@/components/DemoBanner';
import { StepWizard } from '@/components/StepWizard';
import { useVaultStore } from '@/store/vault';
import { createDWallet, type DKGResult } from '@/lib/ika';
import { createInputCiphertext } from '@/lib/encrypt';
import {
  buildOpenPositionInstruction,
  buildDepositInstruction,
} from '@/lib/pvault';
import { DEMO_MODE, SATS_PER_BTC } from '@/lib/config';
import { toast } from 'sonner';
import {
  Copy,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ArrowRight,
  Info,
} from 'lucide-react';

const STEPS = ['Create Custody Wallet', 'Send BTC', 'Confirm Deposit'];

export default function DepositPage() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const router = useRouter();
  const { setPosition } = useVaultStore();

  const [step, setStep] = useState(1);
  const [dkgLoading, setDkgLoading] = useState(false);
  const [dkgResult, setDkgResult] = useState<DKGResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmStep, setConfirmStep] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('0.15');

  // Show "skip" button in demo mode after 3 seconds when waiting for BTC
  useEffect(() => {
    if (step === 2 && DEMO_MODE) {
      const id = setTimeout(() => setShowSkip(true), 3000);
      return () => clearTimeout(id);
    }
  }, [step]);

  const handleCreateWallet = useCallback(async () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    setDkgLoading(true);
    try {
      const result = await createDWallet(publicKey.toBase58());
      setDkgResult(result);
      toast.success('dWallet created via Ika MPC');
      setStep(2);
    } catch (e) {
      toast.error('DKG failed — check console');
      console.error(e);
    } finally {
      setDkgLoading(false);
    }
  }, [publicKey, setVisible]);

  const handleCopy = useCallback(() => {
    if (!dkgResult?.btcAddress) return;
    navigator.clipboard.writeText(dkgResult.btcAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [dkgResult]);

  const handleConfirmDeposit = useCallback(async () => {
    if (!publicKey) {
      setVisible(true);
      return;
    }
    setConfirming(true);
    setTxHash(null);

    try {
      const collateralSats = BigInt(Math.round(parseFloat(depositAmount) * SATS_PER_BTC));

      // Step 1: create Encrypt EUint64 ciphertext for collateral sats
      setConfirmStep('Encrypting collateral amount via Encrypt…');
      const { ciphertextPubkey: collateralCtPubkey } = await createInputCiphertext(collateralSats);

      // Step 2: collateral_usd_ct is a second pre-funded account (demo: use another mock pubkey)
      const collateralUsdCtPubkey = DEMO_MODE
        ? 'Enc2' + collateralCtPubkey.slice(4)
        : collateralCtPubkey; // live: must be pre-allocated; handled by keeper

      if (DEMO_MODE) {
        // Demo: simulate FHE graph execution delay
        setConfirmStep('Computing FHE graph: calc_collateral_usd…');
        await new Promise((r) => setTimeout(r, 1000));
        setConfirmStep('Sending DepositCollateral to pvault…');
        await new Promise((r) => setTimeout(r, 800));

        const mockTx =
          Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        setTxHash(mockTx);

        setPosition({
          dwalletPda: dkgResult?.dwalletPda ?? 'DWa11et111111111111111111111111111111111111',
          btcAddress: dkgResult?.btcAddress ?? 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
          collateralSats: Number(collateralSats),
          debtUsdcE6: 0,
          ltvBps: 0,
          healthStatus: 'healthy',
          encCollateralPubkey: collateralCtPubkey,
          encDebtPubkey: 'Enc2000000000000001111111111111111111111111',
          status: 'open',
        });

        toast.success('Deposit confirmed! Position opened.');
      } else {
        // Live: build + send real transaction
        setConfirmStep('Building OpenPosition + DepositCollateral instructions…');

        const openIx = await buildOpenPositionInstruction(
          publicKey,
          dkgResult?.dwalletPda ?? '',
          dkgResult?.btcAddress ?? ''
        );
        const depositIx = buildDepositInstruction(
          publicKey,
          new PublicKey(collateralCtPubkey),
          new PublicKey(collateralUsdCtPubkey),
          collateralSats
        );

        const { blockhash } = await connection.getLatestBlockhash();
        const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
        tx.add(openIx, depositIx);

        setConfirmStep('Awaiting wallet signature…');
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, 'confirmed');
        setTxHash(sig);

        setPosition({
          dwalletPda: dkgResult?.dwalletPda ?? '',
          btcAddress: dkgResult?.btcAddress ?? '',
          collateralSats: Number(collateralSats),
          debtUsdcE6: 0,
          ltvBps: 0,
          healthStatus: 'healthy',
          encCollateralPubkey: collateralCtPubkey,
          encDebtPubkey: '11111111111111111111111111111111',
          status: 'open',
        });

        toast.success('Deposit confirmed! Position opened.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Deposit failed — check console');
    } finally {
      setConfirming(false);
      setConfirmStep('');
    }
  }, [publicKey, setVisible, connection, sendTransaction, dkgResult, depositAmount, setPosition]);

  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <NavBar />

      <main className="flex-1 container max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Deposit BTC Collateral
          </h1>
          <p className="text-sm text-muted-foreground">
            Create an Ika dWallet custody address and deposit BTC from any
            chain.
          </p>
        </div>

        {/* Step wizard */}
        <StepWizard steps={STEPS} currentStep={step} />

        {/* ── Step 1: Create dWallet ── */}
        {step === 1 && (
          <div className="vault-card-glow p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Step 1 — Create Custody Wallet
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This runs DKG (Distributed Key Generation) via the Ika Network
                to create a Secp256k1 dWallet. The resulting BTC address is
                controlled by a joint key — only your pvault program can
                authorize transactions.
              </p>
            </div>

            <div className="bg-secondary/40 rounded-lg p-4 text-xs text-muted-foreground space-y-1.5 border border-border/50">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-cyan-500 mt-0.5 shrink-0" />
                <span>
                  No bridge, no wrapped tokens. Your BTC stays on Bitcoin — the
                  dWallet holds the signing key.
                </span>
              </div>
              {DEMO_MODE && (
                <div className="flex items-start gap-2 mt-1">
                  <Info className="h-3.5 w-3.5 text-orange-400 mt-0.5 shrink-0" />
                  <span className="text-orange-300/70">
                    Demo mode: returns a deterministic mock dWallet after 2s.
                    Uses Bitcoin signet address.
                  </span>
                </div>
              )}
            </div>

            {!connected ? (
              <Button
                onClick={() => setVisible(true)}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                Connect Wallet First
              </Button>
            ) : (
              <Button
                onClick={handleCreateWallet}
                disabled={dkgLoading}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white gap-2 font-semibold"
              >
                {dkgLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running DKG protocol via Ika…
                  </>
                ) : (
                  <>
                    Create dWallet
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── Step 2: Send BTC ── */}
        {step === 2 && dkgResult && (
          <div className="vault-card-glow p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Step 2 — Send BTC to Deposit Address
              </h2>
              <p className="text-sm text-muted-foreground">
                Send Bitcoin (signet) to this address. We&apos;re waiting for 1
                confirmation.
              </p>
            </div>

            {/* BTC address box */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Your dWallet BTC Address
              </p>
              <div className="flex items-center gap-2 bg-secondary/50 rounded-lg border border-cyan-500/20 px-4 py-3">
                <span className="font-num text-sm text-cyan-300 flex-1 break-all">
                  {dkgResult.btcAddress}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0 h-7 w-7 p-0 hover:bg-cyan-500/10"
                >
                  {copied ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
              <span>Waiting for 1 confirmation on Bitcoin signet…</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <a
                href="https://signet.bc-2.jp/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline"
              >
                Get signet BTC from faucet
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`https://mempool.space/signet/address/${dkgResult.btcAddress}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline"
              >
                View on mempool.space
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {showSkip && DEMO_MODE && (
              <div className="border border-orange-500/30 bg-orange-500/5 rounded-lg p-3 space-y-2">
                <p className="text-xs text-orange-300/80">
                  Demo mode: skip BTC confirmation and proceed.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStep(3)}
                  className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 text-xs"
                >
                  Skip to Confirm Deposit (demo)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Confirm Deposit ── */}
        {step === 3 && (
          <div className="vault-card-glow p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">
                Step 3 — Confirm Deposit
              </h2>
              <p className="text-sm text-muted-foreground">
                Submit the deposit instruction to pvault. This stores your
                collateral as an encrypted EUint64 via Encrypt.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                BTC Amount to Deposit
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  step="0.001"
                  min="0.001"
                  className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2.5 font-num text-sm text-foreground focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
                />
                <span className="text-sm text-muted-foreground font-semibold">
                  BTC
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                ≈ $
                {(parseFloat(depositAmount || '0') * 90_000).toLocaleString(
                  'en-US',
                  { maximumFractionDigits: 0 }
                )}{' '}
                USD at $90,000 / BTC
              </p>
            </div>

            <div className="bg-secondary/40 rounded-lg border border-border/50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Instruction</span>
                <span className="font-num">DepositCollateral [0x02]</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Program</span>
                <span className="font-num text-cyan-400/80">
                  3YUVeW…v8iq
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encrypt</span>
                <span className="text-muted-foreground/60">
                  Creates EUint64 ciphertext
                </span>
              </div>
            </div>

            {confirming && confirmStep && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-cyan-500/5 border border-cyan-500/15 rounded-lg p-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500 shrink-0" />
                <span>{confirmStep}</span>
              </div>
            )}

            {txHash && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-1.5">
                <p className="text-xs text-emerald-400 font-semibold">
                  Transaction confirmed!
                </p>
                <a
                  href={`https://solscan.io/tx/${txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-cyan-400 hover:underline font-num break-all"
                >
                  {txHash.slice(0, 20)}…{txHash.slice(-10)}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <Button
                  size="sm"
                  onClick={() => router.push('/dashboard')}
                  className="w-full mt-1 bg-cyan-600 hover:bg-cyan-500 text-white"
                >
                  Go to Dashboard
                </Button>
              </div>
            )}

            {!txHash && (
              <Button
                onClick={handleConfirmDeposit}
                disabled={confirming}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white gap-2 font-semibold"
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting to Solana…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm Deposit
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
