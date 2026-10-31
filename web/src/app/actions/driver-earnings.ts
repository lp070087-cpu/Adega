'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { requireDriver, requirePermission, toActionError } from '@/lib/auth/guards';
import { getDriverEarnings } from '@/lib/data/driver-earnings';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { MAX_PAY_CENTS, parseMoneyCents, type DriverPayRule } from '@/lib/driver-earnings';

const periodSchema = z.enum(['today', 'week', 'month']);

/** Sem parâmetro de entregador: ele só enxerga o que é dele. */
export async function loadOwnDriverEarnings(period: unknown) {
  const ctx = await requireDriver();
  return getDriverEarnings(ctx.organizationId, ctx.driver.id, periodSchema.parse(period));
}

export async function loadStoreDriverEarnings(period: unknown) {
  const ctx = await requirePermission('MANAGE_DRIVERS');
  return getDriverEarnings(ctx.organizationId, null, periodSchema.parse(period));
}

export async function saveDriverPayRule(form: FormData): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requirePermission('MANAGE_DRIVERS');
    const mode = form.get('mode') === 'FEE_PERCENT' ? 'FEE_PERCENT' : 'FIXED';
    let amountCents = 0;
    let percent = 0;
    if (mode === 'FIXED') {
      const cents = parseMoneyCents(String(form.get('amount') ?? ''));
      if (cents === null) return { ok: false, error: 'Informe um valor em reais, como 5,00.' };
      if (cents > MAX_PAY_CENTS) return { ok: false, error: 'Informe entre R$ 0,00 e R$ 10.000,00 por entrega.' };
      amountCents = cents;
    } else {
      percent = Number(String(form.get('percent') ?? '').trim().replace(',', '.'));
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { ok: false, error: 'Informe um percentual entre 0 e 100.' };
    }
    const rule: DriverPayRule = { mode, amountCents, percent, updatedAt: new Date().toISOString(), updatedBy: ctx.user.id };
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { settings: true } });
      const settings = (org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings) ? org.settings : {}) as Prisma.JsonObject;
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { settings: { ...settings, driverPayRule: rule } } });
      await tx.notification.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.user.id,
          type: 'SYSTEM',
          title: 'Remuneração de entregas alterada',
          message: mode === 'FIXED' ? `Valor fixo de ${(amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por entrega, para as próximas conclusões.` : `${percent}% da taxa de entrega, para as próximas conclusões.`,
        },
      });
    });
    revalidatePath('/app/entregadores');
    revalidatePath('/entregador');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}
