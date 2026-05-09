/**
 * POST /api/ika/sign
 *
 * Server-side gRPC bridge to Ika pre-alpha NOA signing endpoint.
 * Asks the dWallet NOA to sign a Bitcoin transaction digest.
 */
import { NextRequest, NextResponse } from 'next/server';

const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  process.env.NODE_ENV === 'development';

export async function POST(req: NextRequest) {
  const { dwalletPda, txDigest } = await req.json();

  if (!dwalletPda || !txDigest) {
    return NextResponse.json(
      { error: 'dwalletPda and txDigest required' },
      { status: 400 }
    );
  }

  if (DEMO_MODE || !process.env.IKA_GRPC_URL) {
    return NextResponse.json({
      signature: 'DEMO_SIG_' + String(txDigest).slice(0, 16),
      demo: true,
    });
  }

  // TODO: Live gRPC - call Ika approve_message / sign endpoint
  return NextResponse.json(
    { error: 'Live Ika sign mode not yet configured' },
    { status: 501 }
  );
}
