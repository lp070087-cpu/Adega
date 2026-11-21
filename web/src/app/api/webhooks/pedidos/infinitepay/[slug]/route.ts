import { NextRequest, NextResponse } from 'next/server';
import { confirmInfinitePayPayment } from '@/lib/order-payments';

export const runtime = 'nodejs';

/**
 * Aviso da InfinitePay de que um link foi pago. O corpo NÃO é assinado:
 * serve só de gatilho para conferir no /payment_check (ver
 * confirmInfinitePayPayment). 200 encerra; 400 faz a InfinitePay reenviar.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65536) return new NextResponse(null, { status: 413 });
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { return new NextResponse(null, { status: 400 }); }
  try {
    const { status, result } = await confirmInfinitePayPayment(slug, { orderNsu: payload.order_nsu, transactionNsu: payload.transaction_nsu, invoiceSlug: payload.invoice_slug ?? payload.slug, receiptUrl: payload.receipt_url });
    return NextResponse.json({ result }, { status });
  } catch {
    // Falha ao consultar a InfinitePay: pede o reenvio do aviso.
    return NextResponse.json({ error: 'Falha temporária' }, { status: 400 });
  }
}
