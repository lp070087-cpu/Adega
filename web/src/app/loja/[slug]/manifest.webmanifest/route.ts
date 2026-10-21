import { getPublicStoreBySlug } from '@/lib/data/organization';
import { customerManifest, storeAppPath } from '@/lib/pwa';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try { storeAppPath(slug); } catch { return new Response(null, { status: 404 }); }
  const store = await getPublicStoreBySlug(slug);
  if (!store || store.status === 'CANCELLED') return new Response(null, { status: 404 });
  return Response.json(customerManifest(store), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
