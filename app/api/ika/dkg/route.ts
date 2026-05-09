/**
 * POST /api/ika/dkg
 *
 * Server-side gRPC bridge to Ika pre-alpha DKG endpoint.
 * In DEMO_MODE (or when IKA_GRPC_URL is unset) returns a deterministic stub.
 * In live mode: TODO wire up @grpc/grpc-js with ika.proto once proto is available.
 */
import { NextRequest, NextResponse } from 'next/server';

const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  process.env.NODE_ENV === 'development';

export async function POST(req: NextRequest) {
  const { userPublicKey } = await req.json();

  if (!userPublicKey || typeof userPublicKey !== 'string') {
    return NextResponse.json({ error: 'userPublicKey required' }, { status: 400 });
  }

  if (DEMO_MODE || !process.env.IKA_GRPC_URL) {
    // Stub: architecture is real, network is mocked (pre-alpha acceptable)
    return NextResponse.json({
      dwalletPublicKey:
        '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      dwalletPda: 'DWa11et1111111111111111111111111111111111111',
      btcAddress: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
      demo: true,
    });
  }

  // Live mode — requires IKA_GRPC_URL + ika.proto from dwallet-labs/ika-pre-alpha
  // const grpc = await import('@grpc/grpc-js');
  // const protoLoader = await import('@grpc/proto-loader');
  // const packageDef = protoLoader.loadSync('./proto/ika.proto', { ...options });
  // const ikaProto = grpc.loadPackageDefinition(packageDef);
  // const client = new ikaProto.ika.DWalletService(
  //   process.env.IKA_GRPC_URL,
  //   grpc.credentials.createSsl()
  // );
  // const result = await new Promise((resolve, reject) => {
  //   client.dkg({ userPublicKey }, (err: Error, res: DKGResult) => {
  //     if (err) reject(err); else resolve(res);
  //   });
  // });
  // return NextResponse.json(result);

  return NextResponse.json(
    { error: 'Live Ika gRPC mode not yet configured' },
    { status: 501 }
  );
}
