'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as customers from '@/lib/data/customers';
import { customerAddressSchema, customerSchema } from '@/lib/validations/operations';

/**
 * Clientes. Os números da lista (pedidos, total gasto, ticket médio)
 * saem de agregação sobre Order — não existe contador gravado que possa
 * ficar dessincronizado do histórico real.
 */

export type CustomerActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function formToObject(formData: FormData) {
  return {
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email') || undefined,
    notes: formData.get('notes') || undefined,
  };
}

export async function createCustomerAction(
  formData: FormData,
): Promise<CustomerActionResult<{ id: string }>> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');

    const parsed = customerSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    const customer = await customers.upsertCustomer(organizationId, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      notes: parsed.data.notes || undefined,
    });

    revalidatePath('/app/clientes');
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateCustomerAction(
  customerId: string,
  formData: FormData,
): Promise<CustomerActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');

    const parsed = customerSchema.safeParse(formToObject(formData));
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    await customers.updateCustomer(organizationId, customerId, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      notes: parsed.data.notes || undefined,
    });

    revalidatePath('/app/clientes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function deleteCustomerAction(customerId: string): Promise<CustomerActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');
    await customers.deleteCustomer(organizationId, customerId);
    revalidatePath('/app/clientes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Endereço de entrega cadastrado para o cliente. */
export async function saveCustomerAddressAction(formData: FormData): Promise<CustomerActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_ORDERS');

    const parsed = customerAddressSchema.safeParse({
      customerId: formData.get('customerId'),
      label: formData.get('label') || undefined,
      street: formData.get('street'),
      number: formData.get('number') || undefined,
      complement: formData.get('complement') || undefined,
      district: formData.get('district') || undefined,
      city: formData.get('city') || undefined,
      state: formData.get('state') || undefined,
      zipCode: formData.get('zipCode') || undefined,
      isDefault: formData.get('isDefault') === 'on',
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    await customers.createAddress(organizationId, parsed.data);
    revalidatePath('/app/clientes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

