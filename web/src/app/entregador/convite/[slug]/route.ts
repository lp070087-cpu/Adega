import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getRegistrationLink, registrationPath } from '@/lib/data/driver-applications';

export const dynamic = 'force-dynamic';

/** Legacy invitation links now land on the store's single driver link (or the driver login). */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = /^[a-z0-9-]{1,160}$/.test(slug) ? await prisma.organization.findUnique({ where: { slug }, select: { id: true } }) : null;
  const link = store ? await getRegistrationLink(store.id) : null;
  return NextResponse.redirect(new URL(link ? registrationPath(link) : '/entregador/', request.url));
}
