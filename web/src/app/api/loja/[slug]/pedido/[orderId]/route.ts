import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Tiny status probe for the tracking page: a few bytes instead of the whole
 * page on every poll. The non-sequential order id is the capability, exactly
 * like the tracking page itself; no customer data is returned.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!/^c[a-z0-9]{20,40}$/.test(orderId)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
  const order = await prisma.order.findFirst({
    where: { id: orderId, organization: { slug } },
    select: { status: true, updatedAt: true, delivery: { select: { status: true, updatedAt: true } } },
  });
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
  const version = [order.status, order.updatedAt.toISOString(), order.delivery?.status ?? '', order.delivery?.updatedAt.toISOString() ?? ''].join('|');
  return NextResponse.json({ version, terminal: order.status === 'DELIVERED' || order.status === 'CANCELLED' }, { headers });
}
