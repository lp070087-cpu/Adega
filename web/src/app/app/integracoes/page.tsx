import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { isEncryptionConfigured } from '@/lib/crypto';
import { getIntegrations, getIntegrationEvents } from '@/lib/data/integrations';
import {
  IntegrationsManager,
  type IntegrationRow,
  type IntegrationEventRow,
} from '@/components/integrations/IntegrationsManager';

export const metadata = { title: 'Integrações' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INTEGRAÇÕES
 * -----------------------------------------------------------------------
 * `encryptionReady` é lido no SERVIDOR e desce como prop. A tela não
 * descobre isso por conta própria: variável de ambiente sem NEXT_PUBLIC_
 * não chega ao navegador, e é assim que deve ser.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function IntegrationsPage() {
  const ctx = await requireOrgPage('MANAGE_INTEGRATIONS');

  const [integrations, eventsRaw] = await Promise.all([
    getIntegrations(ctx.organizationId),
    getIntegrationEvents(ctx.organizationId, { limit: 40 }),
  ]);

  const rows: IntegrationRow[] = integrations.map((integration) => ({
    id: integration.id,
    provider: integration.provider,
    status: integration.status,
    externalMerchantId: integration.externalMerchantId,
    lastSyncAt: integration.lastSyncAt ? integration.lastSyncAt.toISOString() : null,
    lastError: integration.lastError,
    credentials: integration.credentials.map((credential) => ({
      id: credential.id,
      hint: credential.hint,
      updatedAt: credential.updatedAt.toISOString(),
    })),
    events: integration.events,
  }));

  const events: IntegrationEventRow[] = eventsRaw.map((event) => ({
    id: event.id,
    provider: event.provider,
    externalEventId: event.externalEventId,
    eventType: event.eventType,
    status: event.status,
    error: event.error,
    receivedAt: event.receivedAt.toISOString(),
    processedAt: event.processedAt ? event.processedAt.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Integrações</h2>
        <p className="text-[0.8rem] text-ink-500">
          Marketplaces, mapas e o estado real de cada conexão.
        </p>
      </div>

      <IntegrationsManager
        integrations={rows}
        events={events}
        canManage={can(ctx.role, 'MANAGE_INTEGRATIONS')}
        encryptionReady={isEncryptionConfigured()}
      />
    </div>
  );
}
