'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { OperationError } from '@/lib/operation-error';
import { requireDriver, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { Prisma } from '@prisma/client';
import { phoneSchema, usernameSchema } from '@/lib/validations/common';

const ownDriverProfileSchema = z.object({
  username: z.union([z.literal(''), usernameSchema]).optional(),
  phone: z.union([z.literal(''), phoneSchema]),
  address: z.string().trim().max(300, 'O endereço deve ter até 300 caracteres.'),
});

export async function updateOwnDriverProfile(form: FormData): Promise<{ ok: true } | { ok: false; error: string; field?: string; code?: string }> {
  try {
    const ctx = await requireDriver();
    const parsed = ownDriverProfileSchema.safeParse({
      username: typeof form.get('username') === 'string' ? String(form.get('username')).trim() : undefined,
      phone: form.get('phone'),
      address: form.get('address'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: issue.message, field: String(issue.path[0]) };
    }
    const { phone, address, username } = parsed.data;
    await withOrganizationTransaction(ctx.organizationId, async (tx) => {
      if (username === '' && !await tx.user.findFirst({ where: { id: ctx.user.id, email: { not: null } }, select: { id: true } })) {
        throw new OperationError('Informe um nome de usuário para manter seu acesso.');
      }
      await tx.driver.update({
        where: { id: ctx.driver.id, organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
        data: { phone: phone.replace(/\D/g, '') },
      });
      await tx.user.update({
        where: { id: ctx.user.id, active: true },
        data: { driverProfileAddress: address || null, ...(username !== undefined && { username: username || null }) },
      });
    });
    revalidatePath('/entregador');
    revalidatePath('/app/entregadores');
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { ok: false, error: 'Este nome de usuário já está em uso.', field: 'username' };
    return { ok: false, ...toActionError(error) };
  }
}
