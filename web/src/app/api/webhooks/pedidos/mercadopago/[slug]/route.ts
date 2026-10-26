import { NextRequest, NextResponse } from 'next/server';
import { handleMercadoPagoWebhook } from '@/lib/order-payments';

export const runtime = 'nodejs';

/** Webhook do Mercado Pago da loja: confirma, recusa ou estorna pagamentos online de pedidos. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return new NextResponse(null, { status: 413 });
  let payload: unknown = {};
  if (raw) { try { payload = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); } }
  try {
    const url = new URL(request.url);
    const { status, result } = await handleMercadoPagoWebhook(slug, { signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id') }, url.searchParams.get('data.id') ?? url.searchParams.get('id'), payload);
    return NextResponse.json({ result }, { status });
  } catch {
    // Falha temporária ao reler o pagamento: o Mercado Pago reenvia a notificação.
    return NextResponse.json({ error: 'Falha temporária' }, { status: 500 });
  }
}
