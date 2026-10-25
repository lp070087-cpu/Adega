import { NextRequest, NextResponse } from 'next/server';
import { handleOrderPaymentWebhook } from '@/lib/order-payments';

export const runtime = 'nodejs';

/** Webhook do Asaas da loja: confirma pagamento online de pedidos. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return new NextResponse(null, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }
  try {
    const { status, result } = await handleOrderPaymentWebhook(slug, request.headers.get('asaas-access-token'), payload);
    return NextResponse.json({ result }, { status });
  } catch {
    // Falha temporária ao reler o pagamento: o Asaas reenvia o evento.
    return NextResponse.json({ error: 'Falha temporária' }, { status: 500 });
  }
}
