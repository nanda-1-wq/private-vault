interface HealthBarProps {
  ltvBps: number;
}

export function HealthBar({ ltvBps }: HealthBarProps) {
  const ltv = ltvBps / 100;
  const pct = Math.min((ltv / 100) * 100, 100);

  const colorClass =
    ltv < 70
      ? 'from-emerald-500 to-green-400'
      : ltv < 80
        ? 'from-yellow-500 to-amber-400'
        : 'from-red-600 to-rose-500';

  const textColor =
    ltv < 70
      ? 'text-emerald-400'
      : ltv < 80
        ? 'text-yellow-400'
        : 'text-red-400';

  const statusLabel =
    ltv < 70 ? 'Healthy' : ltv < 80 ? 'At Risk' : 'Liquidatable';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">LTV Health</span>
        <div className="flex items-center gap-2">
          <span className={`font-num font-semibold ${textColor}`}>
            {ltv.toFixed(1)}%
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              ltv < 70
                ? 'bg-emerald-500/15 text-emerald-400'
                : ltv < 80
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-red-500/15 text-red-400'
            }`}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
        {/* Background track with threshold markers */}
        <div className="relative h-full w-full">
          {/* Fill bar */}
          <div
            className={`h-full bg-gradient-to-r ${colorClass} rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
          {/* 70% marker */}
          <div
            className="absolute top-0 h-full w-px bg-yellow-500/60"
            style={{ left: '70%' }}
          />
          {/* 80% marker */}
          <div
            className="absolute top-0 h-full w-px bg-red-500/60"
            style={{ left: '80%' }}
          />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground/70">
        <span>0%</span>
        <span className="text-yellow-600/80">70% max borrow</span>
        <span className="text-red-600/80">80% liquidation</span>
        <span>100%</span>
      </div>
    </div>
  );
}
