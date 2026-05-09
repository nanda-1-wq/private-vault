'use client';

import { useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import { useVaultStore } from '@/store/vault';

export function BtcPrice() {
  const { btcPriceUsd, setBtcPrice } = useVaultStore();

  useEffect(() => {
    // Demo mode: gentle price drift every 30s
    const tick = () => {
      const drift = (Math.random() - 0.5) * 150;
      setBtcPrice(Math.round(90_000 + drift));
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [setBtcPrice]);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <TrendingUp className="h-3 w-3 text-amber-500" />
      <span className="text-muted-foreground">BTC</span>
      <span className="font-num font-semibold text-amber-400">
        ${btcPriceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
