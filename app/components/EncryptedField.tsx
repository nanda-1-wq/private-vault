'use client';

import { Lock } from 'lucide-react';

interface EncryptedFieldProps {
  label: string;
  className?: string;
}

export function EncryptedField({ label, className }: EncryptedFieldProps) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className="relative group flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-cyan-500 shrink-0" />
        <span className="font-num text-muted-foreground tracking-wider">
          ••••••
        </span>
        {/* CSS tooltip */}
        <span className="pointer-events-none absolute left-0 -top-9 hidden group-hover:block bg-[#0c1a2e] border border-cyan-500/30 text-cyan-400 text-xs px-2.5 py-1.5 rounded whitespace-nowrap z-20 shadow-lg">
          Protected by Encrypt FHE
        </span>
      </div>
    </div>
  );
}
