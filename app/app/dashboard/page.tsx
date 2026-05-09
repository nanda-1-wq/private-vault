'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { NavBar } from '@/components/NavBar';
import { DemoBanner } from '@/components/DemoBanner';
import { HealthBar } from '@/components/HealthBar';
import { EncryptedField } from '@/components/EncryptedField';
import { useVaultStore } from '@/store/vault';
import { fetchPosition, DEMO_POSITION } from '@/lib/pvault';
import { DEMO_MODE, SATS_PER_BTC, USDC_DECIMALS } from '@/lib/config';
import { toast } from 'sonner';
import { ArrowUpRight, Plus, RefreshCw, ExternalLink } from 'lucide-react';

interface StoredTx {
  hash: string;
  type: 'deposit' | 'borrow';
  timestamp: number;
}

const LTV_HISTORY = [
  { time: '00:00', ltv: 57.2 },
  { time: '02:00', ltv: 56.8 },
  { time: '04:00', ltv: 58.1 },
  { time: '06:00', ltv: 60.4 },
  { time: '08:00', ltv: 59.7 },
  { time: '10:00', ltv: 57.9 },
  { time: '12:00', ltv: 56.5 },
  { time: '14:00', ltv: 58.3 },
  { time: '16:00', ltv: 60.1 },
  { time: '18:00', ltv: 59.8 },
  { time: '20:00', ltv: 59.1 },
  { time: '22:00', ltv: 59.3 },
];

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="vault-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-num text-xl font-semibold ${accent ? 'text-cyan-400' : ''}`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const { position, setPosition, btcPriceUsd, setLoading, isLoading } =
    useVaultStore();
  const [mounted, setMounted] = useState(false);
  const [recentTxs, setRecentTxs] = useState<StoredTx[]>([]);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = JSON.parse(localStorage.getItem('pvault_txs') ?? '[]') as StoredTx[];
      setRecentTxs(stored.slice(0, 3));
    } catch {}
  }, []);

  useEffect(() => {
    if (!connected || !publicKey) return;
    setLoading(true);
    fetchPosition(connection, publicKey, DEMO_MODE)
      .then((p) => setPosition(p ? { ...p, status: 'open' } : null))
      .catch(() => toast.error('Failed to load position'))
      .finally(() => setLoading(false));
  }, [connected, publicKey, connection, setPosition, setLoading]);

  const collateralBtc = position
    ? (position.collateralSats / SATS_PER_BTC).toFixed(4)
    : '0.0000';
  const collateralUsd = position
    ? ((position.collateralSats / SATS_PER_BTC) * btcPriceUsd).toLocaleString(
        'en-US',
        { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }
      )
    : '$0.00';
  const debtUsdc = position
    ? (position.debtUsdcE6 / USDC_DECIMALS).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      })
    : '$0.00';

  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <NavBar />

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Dashboard
            </h1>
            {publicKey && (
              <p className="text-xs text-muted-foreground font-num mt-0.5">
                {publicKey.toBase58().slice(0, 8)}…
                {publicKey.toBase58().slice(-8)}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => {
              if (!publicKey) return;
              setLoading(true);
              fetchPosition(connection, publicKey, DEMO_MODE)
                .then((p) => {
                  setPosition(p ? { ...p, status: 'open' } : null);
                  toast.success('Position refreshed');
                })
                .catch(() => toast.error('Refresh failed'))
                .finally(() => setLoading(false));
            }}
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Not connected */}
        {!connected && (
          <div className="vault-card-glow p-12 flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-muted-foreground text-sm">
              Connect your wallet to view your position.
            </p>
            <Button
              onClick={() => setVisible(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Connect Phantom
            </Button>
          </div>
        )}

        {/* No position yet */}
        {connected && !isLoading && !position && (
          <div className="vault-card-glow p-12 flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-lg font-semibold">No position open</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Deposit BTC as collateral to open a position and start borrowing
              USDC.
            </p>
            <Button asChild className="bg-cyan-600 hover:bg-cyan-500 text-white gap-2">
              <Link href="/deposit">
                <Plus className="h-4 w-4" />
                Open Position
              </Link>
            </Button>
          </div>
        )}

        {/* Position loaded */}
        {connected && position && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Collateral (BTC)"
                value={`${collateralBtc} BTC`}
                sub="Encrypted on-chain"
                accent
              />
              <StatCard
                label="Collateral Value"
                value={collateralUsd}
                sub={`@ $${btcPriceUsd.toLocaleString()} / BTC`}
              />
              <div className="vault-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Debt (USDC)</p>
                <EncryptedField label="" className="mt-0" />
                <p className="text-xs text-muted-foreground font-num">
                  {debtUsdc} (demo)
                </p>
              </div>
              <StatCard
                label="Current LTV"
                value={`${(position.ltvBps / 100).toFixed(1)}%`}
                sub="Max 70% · Liq 80%"
                accent={position.ltvBps / 100 >= 70}
              />
            </div>

            {/* Health bar + actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="vault-card p-5 md:col-span-2 space-y-4">
                <h2 className="text-sm font-semibold">Position Health</h2>
                <HealthBar ltvBps={position.ltvBps} />
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <Button
                    asChild
                    size="sm"
                    className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                  >
                    <Link href="/deposit">
                      <Plus className="h-3.5 w-3.5" />
                      Deposit More
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/borrow">Borrow USDC</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      toast.success('Repay feature coming in T9 (wire-up)')
                    }
                  >
                    Repay
                  </Button>
                </div>
              </div>

              <div className="vault-card p-5 space-y-3">
                <h2 className="text-sm font-semibold">Position Details</h2>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">BTC Address</span>
                    <a
                      href={`https://mempool.space/signet/address/${position.btcAddress}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-num text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      {position.btcAddress.slice(0, 12)}…
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">dWallet PDA</span>
                    <span className="font-num text-xs">
                      {position.dwalletPda.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      Enc Collateral
                    </span>
                    <EncryptedField label="" className="text-right" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Enc Debt</span>
                    <EncryptedField label="" className="text-right" />
                  </div>
                </div>
              </div>
            </div>

            {/* LTV chart */}
            <div className="vault-card p-5 space-y-3">
              <h2 className="text-sm font-semibold">LTV History (24h)</h2>
              {mounted && (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={LTV_HISTORY}
                    margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[50, 85]}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartTooltip
                      contentStyle={{
                        backgroundColor: '#0c1a2e',
                        border: '1px solid rgba(6,182,212,0.25)',
                        borderRadius: 6,
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                      formatter={(v) => [v != null ? `${Number(v).toFixed(1)}%` : '', 'LTV']}
                    />
                    <ReferenceLine
                      y={70}
                      stroke="#eab308"
                      strokeDasharray="4 3"
                      strokeOpacity={0.5}
                    />
                    <ReferenceLine
                      y={80}
                      stroke="#ef4444"
                      strokeDasharray="4 3"
                      strokeOpacity={0.5}
                    />
                    <Line
                      type="monotone"
                      dataKey="ltv"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#06b6d4' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <p className="text-xs text-muted-foreground/60">
                Yellow dashed = 70% max borrow · Red dashed = 80% liquidation
                threshold
              </p>
            </div>

            {/* Recent Transactions */}
            {recentTxs.length > 0 && (
              <div className="vault-card p-5 space-y-3">
                <h2 className="text-sm font-semibold">Recent Transactions</h2>
                <div className="space-y-2">
                  {recentTxs.map((tx) => (
                    <div
                      key={tx.hash}
                      className="flex items-center gap-3 bg-secondary/30 border border-border/40 rounded-lg px-4 py-3"
                    >
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">
                          {tx.type === 'deposit' ? 'Deposit Collateral' : 'Borrow USDC'}
                        </p>
                        <p className="font-num text-xs text-muted-foreground truncate">
                          {tx.hash.slice(0, 16)}…{tx.hash.slice(-12)}
                        </p>
                        <p className="text-xs text-muted-foreground/50">
                          {new Date(tx.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <a
                        href={`https://solscan.io/tx/${tx.hash}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold shrink-0 underline underline-offset-2"
                      >
                        Solscan
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/50">
                  All transactions are real Solana devnet transactions — verifiable on-chain
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
