import { reconcileSaasCheckout } from '@/lib/platform/saas-infinitepay';

export async function POST(request: Request) {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 65_536) return new Response(null, { status: 413 });
  let payload;
  try { payload = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  if (!payload || typeof payload !== 'object') return new Response(null, { status: 400 });
  try {
    const paid = await reconcileSaasCheckout({ orderNsu: payload.order_nsu, transactionNsu: payload.transaction_nsu, slug: payload.invoice_slug ?? payload.slug });
    return Response.json({ paid });
  } catch {
    return Response.json({ error: 'Confirmação temporariamente indisponível' }, { status: 400 });
  }
}
