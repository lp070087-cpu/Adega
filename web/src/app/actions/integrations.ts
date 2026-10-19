'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { IntegrationProvider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requirePlatformRole } from '@/lib/platform/auth';
import { encryptJson, isEncryptionConfigured } from '@/lib/crypto';
import { toActionError } from '@/lib/auth/guards';
import { OperationError } from '@/lib/operation-error';

export type IntegrationActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; field?: string };
const providerSchema = z.enum(['IFOOD', 'FOOD99', 'ZE_DELIVERY', 'GOOGLE_MAPS']);
const targetSchema = z.object({ organizationId: z.string().min(1).max(64), reason: z.string().trim().min(5).max(300), confirmation: z.literal('CONFIRMAR') });
async function target(input: unknown) {
  const operator = await requirePlatformRole(['OWNER', 'ADMIN']);
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) throw new OperationError('Informe o estabelecimento, o motivo e confirme a alteração.');
  const org = await prisma.organization.findUnique({ where: { id: parsed.data.organizationId }, select: { id: true } });
  if (!org) throw new OperationError('Estabelecimento não encontrado.');
  return { operator, ...parsed.data };
}

/** Central-only, no decryption path. Existing encrypted records remain preserved. */
export async function saveIntegrationCredentialAction(formData: FormData): Promise<IntegrationActionResult> {
  try {
    const ctx = await target(Object.fromEntries(formData));
    const provider = providerSchema.parse(formData.get('provider'));
    if (!isEncryptionConfigured()) throw new OperationError('Gravação de credenciais indisponível. Contate o responsável pela configuração da plataforma.');
    let raw: unknown;
    try { raw = JSON.parse(String(formData.get('payload') ?? '')); } catch { throw new OperationError('Informe uma credencial válida.'); }
    const parsed = z.record(z.string().max(2000)).refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 20).safeParse(raw);
    if (!parsed.success) throw new OperationError('Informe os campos de credencial em formato válido.');
    const payload = parsed.data;
    const encrypted = encryptJson(payload);
    // Mask is a fixed label: never return credential content, including short secrets.
    const hint = 'Credencial protegida';
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${ctx.organizationId} FOR UPDATE`;
      const integration = await tx.integration.upsert({
        where: { organizationId_provider: { organizationId: ctx.organizationId, provider } },
        create: { organizationId: ctx.organizationId, provider, status: 'PENDING' },
        update: { status: 'PENDING' },
      });
      await tx.integrationCredential.create({ data: { integrationId: integration.id, encryptedPayload: encrypted, hint } });
      await tx.platformAudit.create({ data: { operatorId: ctx.operator.operatorId, action: 'INTEGRATION_CREDENTIAL_SAVED', resourceType: 'Integration', resourceId: integration.id, organizationId: ctx.organizationId, reason: ctx.reason, details: { provider } } });
    });
    revalidatePath('/admin/integracoes');
    return { ok: true };
  } catch (error) { return { ok: false, ...toActionError(error) }; }
}

export async function setIntegrationStatusAction(input: {
  provider: IntegrationProvider; status: 'DISCONNECTED' | 'PENDING' | 'ACTIVE' | 'ERROR';
  organizationId?: string; reason?: string; confirmation?: string;
  externalMerchantId?: string; lastError?: string;
}): Promise<IntegrationActionResult> {
  try {
    const ctx = await target(input);
    const parsed = z.object({ provider: providerSchema, status: z.enum(['DISCONNECTED', 'PENDING', 'ERROR']), externalMerchantId: z.string().trim().max(120).optional() }).safeParse(input);
    if (!parsed.success) throw new OperationError('Não é possível declarar conexão ativa sem verificação do provedor.');
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${ctx.organizationId} FOR UPDATE`;
      const existing = await tx.integration.findUnique({ where: { organizationId_provider: { organizationId: ctx.organizationId, provider: parsed.data.provider } }, select: { id: true, status: true } });
      if (!existing) throw new OperationError('Integração não encontrada.');
      await tx.integration.update({ where: { id: existing.id }, data: { status: parsed.data.status, ...(parsed.data.externalMerchantId !== undefined ? { externalMerchantId: parsed.data.externalMerchantId || null } : {}) } });
      await tx.platformAudit.create({ data: { operatorId: ctx.operator.operatorId, action: 'INTEGRATION_STATUS_CHANGED', resourceType: 'Integration', resourceId: existing.id, organizationId: ctx.organizationId, reason: ctx.reason, details: { provider: parsed.data.provider, from: existing.status, to: parsed.data.status } } });
    });
    revalidatePath('/admin/integracoes');
    return { ok: true };
  } catch (error) { return { ok: false, ...toActionError(error) }; }
}

/** Disconnecting preserves ciphertext, merchant linkage and historical events. */
export async function disconnectIntegrationAction(provider: IntegrationProvider, organizationId?: string, reason?: string, confirmation?: string): Promise<IntegrationActionResult> {
  return setIntegrationStatusAction({ provider, organizationId, reason, confirmation, status: 'DISCONNECTED' });
}
