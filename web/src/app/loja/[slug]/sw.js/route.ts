import { networkOnlyWorker, storeAppPath } from '@/lib/pwa';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let path: string;
  try { path = storeAppPath(slug); } catch { return new Response(null, { status: 404 }); }
  return new Response(networkOnlyWorker(path, 'a loja e seus pedidos'), { headers: {
    'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache',
    'Service-Worker-Allowed': `${path}/`, 'X-Content-Type-Options': 'nosniff',
  } });
}
