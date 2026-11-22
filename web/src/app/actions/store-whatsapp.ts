'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { whatsappDigits } from '@/lib/whatsapp';

export async function saveStoreWhatsApp(_previous: { ok: boolean; message: string } | null, form: FormData) {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const number = String(form.get('whatsapp') ?? '').trim();
    const whatsapp = whatsappDigits(number);
    if (number && !whatsapp) return { ok: false, message: 'Informe um número brasileiro com DDD.' };
    const store = await prisma.organization.update({ where: { id: organizationId }, data: { whatsapp }, select: { slug: true } });
    revalidatePath('/app/configuracoes/whatsapp');
    revalidatePath('/app/configuracoes/minha-loja');
    revalidatePath(`/loja/${store.slug}`);
    return { ok: true, message: whatsapp ? 'WhatsApp da loja salvo.' : 'Número da loja removido.' };
  } catch (error) {
    return { ok: false, message: toActionError(error).error };
  }
}
