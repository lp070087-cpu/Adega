'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as cash from '@/lib/data/cash';
import {
  cashRegisterSchema,
  cashTransactionSchema,
  closeShiftSchema,
  openShiftSchema,
} from '@/lib/validations/cash';

/**
 * CAIXA — server actions.
 *
 * O operador de caixa não precisa de MANAGE_PRODUCTS; ele precisa de
 * MANAGE_CASH. Cada action confere a permissão antes de tocar no banco.
 */

export type CashActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function firstIssue(error: z.ZodError): { error: string; field?: string } {
  const issue = error.errors[0];
  return { error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
}

export async function openShiftAction(input: {
  cashRegisterId: string;
  openingAmount: number;
}): Promise<CashActionResult<{ id: string; registerName: string }>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_CASH');
    const parsed = openShiftSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const shift = await cash.openCashShift(organizationId, parsed.data, user.id);
    revalidateCash();

    return { ok: true, data: { id: shift.id, registerName: shift.registerName } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function closeShiftAction(input: {
  cashShiftId: string;
  closingAmount: number;
  notes?: string;
}): Promise<CashActionResult<{ difference: number; expected: number }>> {
  try {
    const { organizationId, user } = await requirePermission('MANAGE_CASH');
    const parsed = closeShiftSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const closed = await cash.closeCashShift(organizationId, parsed.data, user.id);
    revalidateCash();

    return {
      ok: true,
      data: { difference: closed.differenceAmount, expected: closed.totals.expectedCash },
    };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Sangria, suprimento, estorno ou ajuste. */
export async function createCashTransactionAction(input: {
  cashShiftId: string;
  type: 'SUPPLY' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'REFUND';
  amount: number;
  description?: string;
}): Promise<CashActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_CASH');
    const parsed = cashTransactionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await cash.createCashTransaction(organizationId, parsed.data);
    revalidateCash();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function createCashRegisterAction(input: {
  name: string;
}): Promise<CashActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = cashRegisterSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await cash.createCashRegister(organizationId, parsed.data);
    revalidateCash();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

function revalidateCash() {
  revalidatePath('/app/caixa');
  revalidatePath('/app/dashboard');
}
