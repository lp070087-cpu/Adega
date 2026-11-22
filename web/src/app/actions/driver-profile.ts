'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireDriver, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { phoneSchema } from '@/lib/validations/common';

const ownDriverProfileSchema = z.object({
  phone: z.union([z.literal(''), phoneSchema]),
  address: z.string().trim().max(300, 'O endereço deve ter até 300 caracteres.'),
});

export async function updateOwnDriverProfile(form: FormData): Promise<{ ok: true } | { ok: false; error: string; field?: string; code?: string }> {
  try {
    const ctx = await requireDriver();
    const parsed = ownDriverProfileSchema.safeParse({
      phone: form.get('phone'),
      address: form.get('address'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: issue.message, field: String(issue.path[0]) };
    }
    const { phone, address } = parsed.data;
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      await tx.driver.update({
        where: { id: ctx.driver.id, organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
        data: { phone: phone.replace(/\D/g, '') },
      });
      await tx.user.update({
        where: { id: ctx.user.id, active: true },
        data: { driverProfileAddress: address || null },
      });
    });
    revalidatePath('/entregador');
    revalidatePath('/app/entregadores');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}
