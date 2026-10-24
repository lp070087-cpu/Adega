import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOrg } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Versão leve da Central de Pedidos: muda quando entra um pedido ou quando
 * um pedido, uma entrega ou a disponibilidade de um entregador é alterada
 * (pela loja ou pelo entregador). A tela consulta isto a cada poucos
 * segundos e só recarrega os dados quando a versão muda.
 */
export async function GET() {
  try {
    const ctx = await requireOrg();
    const rows = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT concat_ws(':',
        (SELECT count(*) FROM "Order" WHERE "organizationId" = ${ctx.organizationId} AND ("createdAt" > now() - interval '48 hours' OR status IN ('NEW','CONFIRMED','PREPARING','READY','WAITING_DRIVER','DISPATCHED'))),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "Order" WHERE "organizationId" = ${ctx.organizationId}),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "Delivery" WHERE "organizationId" = ${ctx.organizationId}),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "Driver" WHERE "organizationId" = ${ctx.organizationId})
      ) AS v`;
    return NextResponse.json({ v: rows[0]?.v ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
