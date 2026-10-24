import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireDriver } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Versão das entregas deste entregador: muda quando a loja atribui, troca ou cancela. */
export async function GET() {
  try {
    const ctx = await requireDriver();
    const rows = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT concat_ws(':',
        (SELECT count(*) FROM "Order" WHERE "organizationId" = ${ctx.organizationId} AND "driverId" = ${ctx.driver.id} AND status IN ('WAITING_DRIVER','DISPATCHED')),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "Order" WHERE "organizationId" = ${ctx.organizationId} AND "driverId" = ${ctx.driver.id}),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "Delivery" WHERE "organizationId" = ${ctx.organizationId} AND "driverId" = ${ctx.driver.id})
      ) AS v`;
    return NextResponse.json({ v: rows[0]?.v ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
