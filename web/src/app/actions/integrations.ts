'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { IntegrationProvider } from '@prisma/client';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { encryptJson, credentialHint, isEncryptionConfigured } from '@/lib/crypto';
import { disconnectIntegration } from '@/lib/data/integrations';
import { integrationCredentialSchema } from '@/lib/validations/operations';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INTEGRAÇÕES — server actions
 * -----------------------------------------------------------------------
 * Único ponto do sistema que grava um segredo de terceiro.
 *
 * Três regras que este arquivo faz cumprir:
 *   1. O segredo é cifrado (AES-256-GCM) antes de tocar o banco. Sem
 *      TOKEN_ENCRYPTION_KEY, a gravação FALHA — fail-closed. Preferimos a
 *      integração desligada a um token de terceiro em texto puro.
 *   2. O valor nunca volta para o navegador; só a máscara (••••1234).
 *   3. o organizationId vem da sessão. Não existe action que receba
 *      integração de outra loja como parâmetro.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type IntegrationActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

export async function saveIntegrationCredentialAction(
  formData: FormData,
): Promise<IntegrationActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_INTEGRATIONS');

    const payloadRaw = formData.get('payload');
    let payload: Record<string, string> = {};
    if (typeof payloadRaw === 'string' && payloadRaw.trim()) {
      try {
        const parsedJson = JSON.parse(payloadRaw);
        if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
          // Só valores escalares: um objeto aninhado aqui é sinal de
          // engano no formulário, não de credencial.
          payload = Object.fromEntries(
            Object.entries(parsedJson).map(([k, v]) => [k, String(v ?? '')]),
          );
        }
      } catch {
        return { ok: false, error: 'Credencial em formato inválido.' };
      }
    }

    const parsed = integrationCredentialSchema.safeParse({
      provider: formData.get('provider'),
      payload,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    // Fail-closed: sem chave de cifragem, não grava.
    if (!isEncryptionConfigured()) {
      return {
        ok: false,
        error:
          'TOKEN_ENCRYPTION_KEY não configurada. Sem ela o sistema não grava credencial — guardar segredo de terceiro em texto puro não é aceitável. Gere uma chave com "openssl rand -base64 32" e reinicie.',
      };
    }

    const provider = parsed.data.provider as IntegrationProvider;

    // A máscara usa o valor mais "secreto" disponível: token > apiKey >
    // clientSecret > primeiro campo. Serve só para o lojista reconhecer
    // qual credencial está gravada.
    const hintSource =
      payload.token ??
      payload.apiKey ??
      payload.clientSecret ??
      payload.appSecret ??
      Object.values(payload)[0] ??
      '';

    const encrypted = encryptJson(payload);

    await prisma.$transaction(async (tx) => {
      const integration = await tx.integration.upsert({
        where: { organizationId_provider: { organizationId, provider } },
        create: {
          organizationId,
          provider,
          status: 'PENDING',
        },
        update: {
          status: 'PENDING',
          lastError: null,
        },
      });

      // Uma credencial por integração: a mais nova substitui a anterior.
      await tx.integrationCredential.deleteMany({ where: { integrationId: integration.id } });
      await tx.integrationCredential.create({
        data: {
          integrationId: integration.id,
          encryptedPayload: encrypted,
          hint: credentialHint(hintSource),
        },
      });
    });

    revalidatePath('/app/integracoes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/**
 * Marca a integração como conectada.
 *
 * ATENÇÃO, e a tela diz isso ao lojista: isto NÃO prova que a credencial
 * funciona. A verificação real é uma chamada à API do provedor, que só
 * existe quando cada adapter for implementado. Enquanto não existe, o
 * status é uma declaração do lojista, não uma constatação do sistema.
 */
export async function setIntegrationStatusAction(input: {
  provider: IntegrationProvider;
  status: 'DISCONNECTED' | 'PENDING' | 'ACTIVE' | 'ERROR';
  externalMerchantId?: string;
  lastError?: string;
}): Promise<IntegrationActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_INTEGRATIONS');

    const parsed = z
      .object({
        provider: z.enum(['IFOOD', 'FOOD99', 'ZE_DELIVERY', 'GOOGLE_MAPS']),
        status: z.enum(['DISCONNECTED', 'PENDING', 'ACTIVE', 'ERROR']),
        externalMerchantId: z.string().trim().max(120).optional(),
        lastError: z.string().trim().max(500).optional(),
      })
      .safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.' };
    }

    const result = await prisma.integration.updateMany({
      where: { organizationId, provider: parsed.data.provider },
      data: {
        status: parsed.data.status,
        ...(parsed.data.externalMerchantId !== undefined
          ? { externalMerchantId: parsed.data.externalMerchantId || null }
          : {}),
        ...(parsed.data.lastError !== undefined ? { lastError: parsed.data.lastError || null } : {}),
        ...(parsed.data.status === 'ACTIVE' ? { lastSyncAt: new Date() } : {}),
      },
    });
    if (result.count === 0) return { ok: false, error: 'Integração não encontrada.' };

    revalidatePath('/app/integracoes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Desconectar apaga as credenciais. O histórico de eventos permanece. */
export async function disconnectIntegrationAction(
  provider: IntegrationProvider,
): Promise<IntegrationActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_INTEGRATIONS');

    const parsed = z.enum(['IFOOD', 'FOOD99', 'ZE_DELIVERY', 'GOOGLE_MAPS']).safeParse(provider);
    if (!parsed.success) return { ok: false, error: 'Provedor inválido.' };

    await disconnectIntegration(organizationId, parsed.data);

    revalidatePath('/app/integracoes');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}
