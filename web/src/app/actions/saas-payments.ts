'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/guards';
import { OperationError } from '@/lib/operation-error';
import { requirePlatformRole } from '@/lib/platform/auth';
import { openSaasCheckout, saveSaasReceiver } from '@/lib/platform/saas-infinitepay';

export async function saveSaasPaymentAction(_: { message: string } | null, form: FormData) {
  try {
    const { operatorId } = await requirePlatformRole(['OWNER']);
    await saveSaasReceiver(String(form.get('apiKey') ?? '').trim(), operatorId);
    revalidatePath('/admin/recebimentos');
    revalidatePath('/app/assinatura');
    return { message: 'Conta InfinitePay validada. Checkout dos planos disponível.' };
  } catch (error) {
    return { message: error instanceof OperationError ? error.message : 'Não foi possível validar a chave na InfinitePay. Confira se o Checkout Integrado está ativo e se a chave é desta conta PJ.' };
  }
}

export async function startSaasCheckoutAction(_: { message: string } | null, form: FormData) {
  let url;
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const planId = String(form.get('planId') ?? '');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(planId)) return { message: 'Plano indisponível.' };
    url = await openSaasCheckout(organizationId, planId);
  } catch (error) {
    return { message: error instanceof OperationError ? error.message : 'Não foi possível abrir o checkout. Tente novamente em instantes.' };
  }
  redirect(url);
}
