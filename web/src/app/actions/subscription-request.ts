'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { OperationError } from '@/lib/operation-error';
import { ADEGA_COMMERCIAL_PLAN } from '@/lib/commercial-plan';
export async function requestSubscriptionPlanAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') throw new OperationError('A seleção de planos será disponibilizada pela administração da plataforma.');
    const parsed = z.object({ planId: z.string().min(1).max(64), confirmed: z.literal(true) }).safeParse(input);
    if (!parsed.success) throw new OperationError('Selecione um plano e confirme a solicitação.');
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const plan = await tx.plan.findFirst({ where: { id: parsed.data.planId, active: true, slug:ADEGA_COMMERCIAL_PLAN.slug,price:ADEGA_COMMERCIAL_PLAN.monthlyPrice }, select: { id: true, name: true } });
      if (!plan) throw new OperationError('Plano indisponível.');
      const title = `Solicitação de plano: ${plan.name}`.slice(0, 160);
      const existing = await tx.platformSupportCase.findFirst({ where: { organizationId: ctx.organizationId, title, status: 'OPEN' }, select: { id: true } });
      if (!existing) await tx.platformSupportCase.create({ data: { organizationId: ctx.organizationId, title, notes: `Solicitado pelo usuário ${ctx.user.id}. Plano ${plan.id}. Aguardando análise comercial; nenhuma cobrança foi gerada.` } });
    });
    revalidatePath('/app/assinatura');
    revalidatePath('/admin/suporte');
    return { ok: true };
  } catch (error) { return { ok: false, ...toActionError(error) }; }
}
