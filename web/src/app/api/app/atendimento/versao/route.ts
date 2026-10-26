import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Versão das conversas da loja: muda quando chega/sai mensagem ou a conversa muda de estado. */
export async function GET() {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const rows = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT concat_ws(':',
        (SELECT count(*) FROM "AssistantMessage" WHERE "organizationId" = ${ctx.organizationId}),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "AssistantMessage" WHERE "organizationId" = ${ctx.organizationId}),
        (SELECT coalesce(extract(epoch FROM max("updatedAt")), 0) FROM "AssistantThread" WHERE "organizationId" = ${ctx.organizationId})
      ) AS v`;
    return NextResponse.json({ v: rows[0]?.v ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
