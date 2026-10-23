import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DRIVER_STORE_COOKIE, driverStoreBySlug } from '@/lib/data/driver-link';

export const dynamic = 'force-dynamic';

/** Fixa a loja do link como loja de trabalho e abre o aplicativo. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await driverStoreBySlug(slug);
  const session = await auth();
  if (!store || !session?.user?.id) return NextResponse.redirect(new URL(store ? `/entregador/loja/${store.slug}` : '/entregador/', request.url));
  const linked = await prisma.organizationUser.findFirst({
    where: { userId: session.user.id, organizationId: store.id, role: 'DRIVER', active: true, organization: { drivers: { some: { userId: session.user.id, active: true } } } },
    select: { id: true },
  });
  if (!linked) return NextResponse.redirect(new URL(`/entregador/loja/${store.slug}`, request.url));
  const response = NextResponse.redirect(new URL('/entregador/', request.url));
  response.cookies.set(DRIVER_STORE_COOKIE, store.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return response;
}
