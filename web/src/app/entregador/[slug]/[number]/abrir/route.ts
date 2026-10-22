import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveRegistrationLink } from '@/lib/data/driver-applications';

export const dynamic = 'force-dynamic';

/**
 * Approved driver opening the store link: select that store as the working
 * store (same httpOnly cookie as the in-app selector) and go to deliveries.
 * Membership is re-checked here; a forged link never selects another tenant.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; number: string }> }) {
  const { number } = await params;
  const home = new URL('/entregador/', request.url);
  const session = await auth();
  const link = await resolveRegistrationLink(number);
  if (!session?.user?.id || session.user.role !== 'DRIVER' || !link) return NextResponse.redirect(home);
  const organizationId = link.organization.id;
  const allowed = await prisma.driver.findFirst({
    where: { organizationId, userId: session.user.id, active: true, user: { active: true, mustChangePassword: false, organizations: { some: { organizationId, role: 'DRIVER', active: true } } } },
    select: { id: true },
  });
  const response = NextResponse.redirect(home);
  if (allowed) response.cookies.set('driver-store', organizationId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
  return response;
}
