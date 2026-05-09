/**
 * GET /api/keeper/refresh
 *
 * Cron health-refresh endpoint - called by Vercel cron or an off-chain keeper.
 * Iterates open positions and CPI-calls refresh_health on any that need updating.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Validate cron secret to prevent unauthorized calls
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: enumerate open position accounts via getProgramAccounts,
  //       build refresh_health instructions, send in batches.
  return NextResponse.json({
    ok: true,
    message: 'Keeper refresh stub - positions not yet scanned',
    timestamp: new Date().toISOString(),
  });
}
