import 'server-only';
import { prisma } from '@/lib/db';
import type { IntegrationProvider } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INTEGRAÇÕES — acesso a dados
 * -----------------------------------------------------------------------
 * Toda função recebe organizationId como primeiro parâmetro.
 *
 * O que é devolvido para a tela NUNCA inclui o conteúdo da credencial:
 * `IntegrationCredential.encryptedPayload` fica no servidor e a interface
 * recebe apenas a máscara (`hint`). Um segredo que sai do servidor já
 * não é segredo.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  'IFOOD',
  'FOOD99',
  'ZE_DELIVERY',
  'GOOGLE_MAPS',
];

export type IntegrationView = {
  id: string;
  provider: IntegrationProvider;
  status: string;
  externalMerchantId: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  credentials: Array<{ id: string; hint: string | null; updatedAt: Date }>;
  events: { pending: number; failed: number; processed: number };
};

/**
 * Integrações da organização, criando as linhas ausentes.
 *
 * A criação sob demanda existe para a tela poder listar TODOS os
 * provedores possíveis — inclusive os que nunca foram tocados — sem que
 * o banco precise de um job de seed por loja.
 */
export async function getIntegrations(organizationId: string): Promise<IntegrationView[]> {
  const existing = await prisma.integration.findMany({
    where: { organizationId },
    include: {
      credentials: {
        select: { id: true, hint: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  const missing = INTEGRATION_PROVIDERS.filter(
    (provider) => !existing.some((row) => row.provider === provider),
  );

  if (missing.length > 0) {
    await prisma.integration.createMany({
      data: missing.map((provider) => ({ organizationId, provider })),
      skipDuplicates: true,
    });
  }

  const rows =
    missing.length > 0
      ? await prisma.integration.findMany({
          where: { organizationId },
          include: {
            credentials: {
              select: { id: true, hint: true, updatedAt: true },
              orderBy: { updatedAt: 'desc' },
            },
          },
        })
      : existing;

  // Contagem de eventos por integração: mostra se algo entrou e travou.
  const eventCounts = await prisma.integrationEvent.groupBy({
    by: ['provider', 'status'],
    where: { organizationId },
    _count: { _all: true },
  });

  return INTEGRATION_PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    const forProvider = eventCounts.filter((e) => e.provider === provider);
    const countOf = (status: string) =>
      forProvider.find((e) => e.status === status)?._count._all ?? 0;

    return {
      id: row?.id ?? '',
      provider,
      status: row?.status ?? 'DISCONNECTED',
      externalMerchantId: row?.externalMerchantId ?? null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastError: row?.lastError ?? null,
      credentials: row?.credentials ?? [],
      events: {
        pending: countOf('RECEIVED'),
        failed: countOf('FAILED'),
        processed: countOf('PROCESSED'),
      },
    };
  });
}

/** Eventos recentes de webhook — para o lojista ver o que chegou. */
export async function getIntegrationEvents(
  organizationId: string,
  options: { provider?: IntegrationProvider; limit?: number } = {},
) {
  return prisma.integrationEvent.findMany({
    where: {
      organizationId,
      ...(options.provider ? { provider: options.provider } : {}),
    },
    orderBy: { receivedAt: 'desc' },
    take: options.limit ?? 30,
    select: {
      id: true,
      provider: true,
      externalEventId: true,
      eventType: true,
      status: true,
      error: true,
      receivedAt: true,
      processedAt: true,
    },
  });
}

export type IntegrationEventView = Awaited<ReturnType<typeof getIntegrationEvents>>[number];

/** Desconecta: apaga as credenciais e marca como DISCONNECTED. */
export async function disconnectIntegration(
  organizationId: string,
  provider: IntegrationProvider,
) {
  const integration = await prisma.integration.findFirst({
    where: { organizationId, provider },
    select: { id: true },
  });
  if (!integration) throw new Error('Integração não encontrada.');

  await prisma.$transaction([
    prisma.integrationCredential.deleteMany({ where: { integrationId: integration.id } }),
    prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'DISCONNECTED',
        externalMerchantId: null,
        lastError: null,
        lastSyncAt: null,
      },
    }),
  ]);

  return { ok: true };
}
