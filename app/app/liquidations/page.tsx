'use client';

import { useState } from 'react';
import { NavBar } from '@/components/NavBar';
import { DemoBanner } from '@/components/DemoBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EncryptedField } from '@/components/EncryptedField';
import { HealthBar } from '@/components/HealthBar';
import { toast } from 'sonner';
import {
  Shield,
  RefreshCw,
  Loader2,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface MockPosition {
  id: string;
  address: string;
  ltvBps: number;
  health: 'healthy' | 'at_risk' | 'liquidatable';
  lastRefresh: string;
  btcAddress: string;
}

const MOCK_POSITIONS: MockPosition[] = [
  {
    id: 'pos_1',
    address: 'Hx7bFQkR…a3Xm',
    ltvBps: 5930,
    health: 'healthy',
    lastRefresh: '2 min ago',
    btcAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
  },
  {
    id: 'pos_2',
    address: 'Br4nPpZw…Kv9d',
    ltvBps: 7450,
    health: 'at_risk',
    lastRefresh: '8 min ago',
    btcAddress: 'tb1q0w508d6qejxtdg4y5r3zarvary0c5xw7kevjw0',
  },
  {
    id: 'pos_3',
    address: 'QmWe1Lzk…D7Yn',
    ltvBps: 8320,
    health: 'liquidatable',
    lastRefresh: '34 min ago',
    btcAddress: 'tb1qrp33g0q5c5txsp9arbe0xmjztfx7yftnvljg0d',
  },
];

const healthBadge = (h: MockPosition['health']) => {
  switch (h) {
    case 'healthy':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
          Healthy
        </Badge>
      );
    case 'at_risk':
      return (
        <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">
          At Risk
        </Badge>
      );
    case 'liquidatable':
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20 animate-pulse">
          Liquidatable
        </Badge>
      );
  }
};

function PositionRow({ pos }: { pos: MockPosition }) {
  const [expanded, setExpanded] = useState(false);
  const [liquidating, setLiquidating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleLiquidate = async () => {
    setLiquidating(true);
    await new Promise((r) => setTimeout(r, 2500));
    toast.success(
      `try_liquidate sent - decrypting health boolean only (position data stays encrypted)`,
      { duration: 5000 }
    );
    setLiquidating(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1500));
    toast.success(`Health refreshed via refresh_health FHE graph`);
    setRefreshing(false);
  };

  return (
    <div className="vault-card overflow-hidden">
      {/* Main row */}
      <div className="flex items-center justify-between p-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0">
            <p className="font-num text-sm font-semibold">{pos.address}</p>
            <p className="text-xs text-muted-foreground">
              Refreshed {pos.lastRefresh}
            </p>
          </div>
        </div>

        <div className="hidden sm:block">{healthBadge(pos.health)}</div>

        <div className="hidden md:block">
          <p className="text-xs text-muted-foreground mb-1">LTV</p>
          <p
            className={`font-num text-sm font-semibold ${
              pos.ltvBps / 100 < 70
                ? 'text-emerald-400'
                : pos.ltvBps / 100 < 80
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }`}
          >
            {(pos.ltvBps / 100).toFixed(1)}%
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs gap-1.5"
          >
            {refreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {pos.health === 'liquidatable' && (
            <Button
              size="sm"
              onClick={handleLiquidate}
              disabled={liquidating}
              className="bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5 font-semibold"
            >
              {liquidating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Liquidating…</span>
                </>
              ) : (
                'Liquidate'
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 p-4 bg-secondary/20 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground mb-1">Collateral</p>
              <EncryptedField label="" />
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Debt</p>
              <EncryptedField label="" />
            </div>
            <div>
              <p className="text-muted-foreground mb-1">BTC Address</p>
              <p className="font-num text-cyan-400">
                {pos.btcAddress.slice(0, 14)}…
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Enc is_unhealthy</p>
              <EncryptedField label="" />
            </div>
          </div>
          <HealthBar ltvBps={pos.ltvBps} />
        </div>
      )}
    </div>
  );
}

export default function LiquidationsPage() {
  const [refreshingAll, setRefreshingAll] = useState(false);

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    await new Promise((r) => setTimeout(r, 2000));
    toast.success('All positions refreshed via RefreshHealth instruction');
    setRefreshingAll(false);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <NavBar />

      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Liquidation Monitor
            </h1>
            <p className="text-sm text-muted-foreground">
              Keeper view - monitor all open positions and trigger liquidations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            className="gap-1.5 text-xs"
          >
            {refreshingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh All Positions
          </Button>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-3 vault-card p-4 border-cyan-500/20">
          <EyeOff className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
          <div className="text-sm space-y-0.5">
            <p className="font-medium">
              All liquidation checks happen on encrypted data.
            </p>
            <p className="text-xs text-muted-foreground">
              Collateral amounts and debt are stored as FHE ciphertexts -
              only the{' '}
              <span className="font-mono text-cyan-400">is_unhealthy</span>{' '}
              boolean is ever decrypted. Position sizes are never revealed,
              eliminating front-running.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Total Positions',
              value: String(MOCK_POSITIONS.length),
              color: '',
            },
            {
              label: 'At Risk',
              value: String(
                MOCK_POSITIONS.filter((p) => p.health === 'at_risk').length
              ),
              color: 'text-yellow-400',
            },
            {
              label: 'Liquidatable',
              value: String(
                MOCK_POSITIONS.filter((p) => p.health === 'liquidatable').length
              ),
              color: 'text-red-400',
            },
          ].map((s) => (
            <div key={s.label} className="vault-card p-4 text-center">
              <p className={`font-num text-2xl font-bold ${s.color}`}>
                {s.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Positions list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Position / Address</span>
            <div className="hidden sm:flex items-center gap-16 pr-4">
              <span>Health</span>
              <span className="hidden md:block">LTV</span>
            </div>
          </div>

          {MOCK_POSITIONS.map((pos) => (
            <PositionRow key={pos.id} pos={pos} />
          ))}
        </div>

        {/* How it works */}
        <div className="vault-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-500" />
            <h2 className="text-sm font-semibold">
              How Private Liquidation Works
            </h2>
          </div>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              <span className="font-mono text-cyan-400/80">
                refresh_health
              </span>{' '}
              executes the{' '}
              <span className="font-mono">calc_health</span> FHE graph →
              stores{' '}
              <span className="font-mono text-cyan-400/80">
                encrypted_is_unhealthy
              </span>{' '}
              ciphertext on-chain.
            </li>
            <li>
              <span className="font-mono text-cyan-400/80">try_liquidate</span>{' '}
              calls{' '}
              <span className="font-mono">request_decryption</span> on{' '}
              <span className="font-mono">encrypted_is_unhealthy</span> ONLY.
              Collateral and debt never decrypted.
            </li>
            <li>
              If decrypted boolean == 1: CPI to Ika{' '}
              <span className="font-mono">approve_message</span> → NOA signs
              BTC transaction → liquidation executes on Bitcoin.
            </li>
            <li>
              Front-runners cannot identify which positions are near threshold -
              they see only ciphertexts.
            </li>
          </ol>
        </div>
      </main>
    </div>
  );
}
