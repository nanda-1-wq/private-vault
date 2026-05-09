import { TriangleAlert } from 'lucide-react';

export function DemoBanner() {
  return (
    <div className="w-full bg-orange-500/8 border-b border-orange-500/25 text-orange-300 px-4 py-2 text-xs flex items-center gap-2">
      <TriangleAlert className="h-3.5 w-3.5 text-orange-400 shrink-0" />
      <span className="font-semibold text-orange-400">PRE-ALPHA DEMO</span>
      <span className="text-orange-300/70">
        Using Ika mock signer + Encrypt pre-alpha (no real encryption yet).
        Architecture is production-ready — privacy guarantee is mocked per
        sponsor expectations.
      </span>
    </div>
  );
}
