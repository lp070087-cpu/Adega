import { NextResponse } from 'next/server';
import { driverStoreBySlug, driverStorePath } from '@/lib/data/driver-link';

export const dynamic = 'force-dynamic';

/** Links antigos de convite levam ao link único da loja. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const store = await driverStoreBySlug((await params).slug);
  return NextResponse.redirect(new URL(store ? driverStorePath(store.slug) : '/entregador/', request.url));
}
