import { configuredAsaas, reconcileAsaasPayment } from '@/lib/platform/asaas';
import { authenticateAsaasWebhook } from '@/lib/platform/asaas-client';
export async function POST(request: Request, context: { params: Promise<{ environment: string }> }) {
  const { environment } = await context.params;
  if (environment !== 'sandbox') return new Response('Ambiente indisponível', { status: 503 });
  try {
    const { credentials } = await configuredAsaas(environment);
    if (!authenticateAsaasWebhook(credentials.webhookToken, request.headers.get('asaas-access-token'))) return new Response('Não autorizado', { status: 401 });
    if (Number(request.headers.get('content-length') || 0) > 65536) return new Response(null, { status: 413 });
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    let bytes = 0; const chunks: Uint8Array[] = [];
    while (true) { const result = await reader.read(); if (result.done) break; bytes += result.value.length; if (bytes > 65536) { await reader.cancel(); return new Response(null, { status: 413 }); } chunks.push(result.value); }
    let payload: { id?: unknown; event?: unknown; payment?: { id?: unknown } };
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return new Response(null, { status: 400 }); }
    if (typeof payload.id !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(payload.id) || typeof payload.event !== 'string') return new Response(null, { status: 400 });
    if (payload.event.startsWith('PAYMENT_') && typeof payload.payment?.id === 'string') await reconcileAsaasPayment(environment, payload.id, payload.payment.id);
    return Response.json({ received: true });
  } catch { return new Response('Processamento pendente; tente novamente', { status: 503 }); }
}
