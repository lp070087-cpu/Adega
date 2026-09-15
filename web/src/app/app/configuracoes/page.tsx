import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { can, permissionsOf } from '@/lib/permissions';
import { getOrganizationById, getOrganizationUsage } from '@/lib/data/organization';
import { getIntegrations } from '@/lib/data/integrations';
import { storageStatus } from '@/lib/storage';
import { isEncryptionConfigured } from '@/lib/crypto';
import { ROLE_LABEL, BUSINESS_COPY, STORE_STATUS_LABEL } from '@/data/business-copy';
import { Badge, Card, CardHeader, StatCard } from '@/components/ui';
import type { BusinessType, StoreStatus } from '@prisma/client';

export const metadata = { title: 'Configurações' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CONFIGURAÇÕES
 * -----------------------------------------------------------------------
 * Esta página NÃO duplica Minha Loja. Minha Loja edita a loja (nome,
 * endereço, entrega). Aqui fica o que é diagnóstico e conta: uso da
 * plataforma, estado das chaves de infraestrutura, e o mapa do que o seu
 * perfil pode fazer.
 *
 * Os estados de armazenamento e de cifragem vêm de funções server-only.
 * Nada disso vai para o navegador como variável pública — a página
 * informa o RESULTADO da checagem, não o valor da chave.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function SettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');

  const [organization, usage, integrations] = await Promise.all([
    getOrganizationById(ctx.organizationId),
    getOrganizationUsage(ctx.organizationId),
    getIntegrations(ctx.organizationId),
  ]);

  const storage = storageStatus();
  const encryptionReady = isEncryptionConfigured();
  const granted = permissionsOf(ctx.role);
  const connectedIntegrations = integrations.filter((i) => i.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Configurações</h2>
        <p className="text-[0.8rem] text-ink-500">
          Diagnóstico da sua conta, da infraestrutura e do que o seu perfil alcança.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="🏷️" label="Produtos no catálogo" value={String(usage.products)} tone="blue" />
        <StatCard icon="🧭" label="Pedidos no histórico" value={String(usage.orders)} tone="orange" />
        <StatCard icon="👥" label="Pessoas com acesso" value={String(usage.users)} tone="purple" />
        <StatCard icon="🛵" label="Entregadores ativos" value={String(usage.drivers)} tone="teal" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ── Identidade da loja (somente leitura) ─────────────────── */}
        <Card>
          <CardHeader
            title="Estabelecimento"
            subtitle="Os dados editáveis ficam em Minha Loja"
            action={
              <Link
                href="/app/minha-loja"
                className="text-[0.78rem] font-semibold text-brand hover:underline"
              >
                Editar
              </Link>
            }
          />

          {organization ? (
            <dl className="space-y-2.5 text-[0.82rem]">
              <Row label="Nome" value={organization.name} />
              <Row
                label="Endereço público"
                value={
                  <Link
                    href={`/loja/${organization.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    /loja/{organization.slug}
                  </Link>
                }
              />
              <Row
                label="Segmento"
                value={
                  organization.businessType
                    ? (BUSINESS_COPY[organization.businessType as BusinessType]?.noun ?? '—')
                    : 'Ainda não definido'
                }
              />
              <Row
                label="Situação da loja"
                value={
                  <Badge
                    tone={
                      organization.storeStatus === 'OPEN'
                        ? 'green'
                        : organization.storeStatus === 'PAUSED'
                          ? 'yellow'
                          : 'red'
                    }
                  >
                    {STORE_STATUS_LABEL[organization.storeStatus as StoreStatus] ??
                      organization.storeStatus}
                  </Badge>
                }
              />
              <Row
                label="Situação da conta"
                value={<Badge tone="neutral">{organization.status}</Badge>}
              />
              {organization.isDemo && (
                <Row label="Observação" value="Dados de demonstração (criados pelo seed)." />
              )}
            </dl>
          ) : (
            <p className="py-6 text-[0.82rem] text-ink-400">Estabelecimento não encontrado.</p>
          )}
        </Card>

        {/* ── Infraestrutura ───────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Infraestrutura"
            subtitle="O que está configurado neste ambiente"
          />

          <div className="space-y-3">
            <InfraRow
              label="Banco de dados"
              ok
              detail="PostgreSQL (Neon), acessado só pelo servidor. O navegador nunca fala com o banco."
            />
            <InfraRow
              label="Storage de imagens"
              ok={storage.configured}
              detail={
                storage.configured
                  ? `Provedor "${storage.provider}" ativo.`
                  : `Nenhum provedor de upload configurado (adapter atual: "${storage.provider}"). As imagens entram por URL. Nada de base64 no banco.`
              }
            />
            <InfraRow
              label="Cifragem de credenciais"
              ok={encryptionReady}
              detail={
                encryptionReady
                  ? 'TOKEN_ENCRYPTION_KEY presente. Credenciais de integração são gravadas cifradas (AES-256-GCM).'
                  : 'TOKEN_ENCRYPTION_KEY ausente. O sistema RECUSA gravar credencial de terceiro — preferimos a integração desligada a um segredo em texto puro.'
              }
            />
            <InfraRow
              label="Integrações conectadas"
              ok={connectedIntegrations > 0}
              detail={
                connectedIntegrations > 0
                  ? `${connectedIntegrations} marcada(s) como conectada(s).`
                  : 'Nenhuma conectada. Os adapters de marketplace ainda não foram implementados — a área de Integrações explica o que falta em cada uma.'
              }
            />
          </div>

          <p className="mt-4 text-[0.72rem] text-ink-400">
            Esta é uma leitura do ambiente do servidor. Nenhuma chave é exibida — só se ela existe.
          </p>
        </Card>
      </div>

      {/* ── Permissões do perfil ───────────────────────────────────── */}
      <Card>
        <CardHeader
          title="O que o seu perfil pode fazer"
          subtitle={`Você entrou como ${ROLE_LABEL[ctx.role] ?? ctx.role}`}
        />

        <div className="flex flex-wrap gap-2">
          {granted.length === 0 ? (
            <p className="text-[0.82rem] text-ink-400">Nenhuma permissão atribuída.</p>
          ) : (
            granted.map((permission) => (
              <Badge key={permission} tone="neutral">
                {PERMISSION_LABEL[permission] ?? permission}
              </Badge>
            ))
          )}
        </div>

        <p className="mt-4 text-[0.72rem] text-ink-400">
          Esconder um item de menu não é segurança: cada página e cada ação conferem a permissão de
          novo no servidor, contra o papel <strong>atual</strong> no banco — não contra o que estava
          no token quando você entrou.
        </p>
      </Card>

      {can(ctx.role, 'MANAGE_TEAM') && (
        <Card>
          <CardHeader title="Atalhos" subtitle="Onde ficam as outras configurações" />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/minha-loja"
              className="rounded-sm border-2 border-ink-200 px-4 py-2.5 text-[0.82rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
            >
              🏪 Minha Loja
            </Link>
            <Link
              href="/app/equipe"
              className="rounded-sm border-2 border-ink-200 px-4 py-2.5 text-[0.82rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
            >
              👤 Equipe
            </Link>
            <Link
              href="/app/integracoes"
              className="rounded-sm border-2 border-ink-200 px-4 py-2.5 text-[0.82rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
            >
              🔌 Integrações
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Rótulos legíveis das permissões. Não vem de business-copy porque é
 * vocabulário interno de acesso, não texto de loja.
 */
const PERMISSION_LABEL: Record<string, string> = {
  VIEW_DASHBOARD: 'Ver a visão geral',
  MANAGE_PRODUCTS: 'Gerenciar catálogo',
  MANAGE_ORDERS: 'Gerenciar pedidos',
  MANAGE_DRIVERS: 'Gerenciar entregadores',
  MANAGE_CASH: 'Operar o caixa',
  VIEW_REPORTS: 'Ver relatórios',
  MANAGE_TEAM: 'Gerenciar a equipe',
  MANAGE_SETTINGS: 'Alterar configurações',
  MANAGE_INTEGRATIONS: 'Gerenciar integrações',
  VIEW_CUSTOMERS: 'Ver clientes',
  MANAGE_STOCK: 'Controlar estoque',
  USE_DRIVER_APP: 'Usar o app do entregador',
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 pb-2.5 last:border-b-0">
      <dt className="text-[0.76rem] text-ink-500">{label}</dt>
      <dd className="font-semibold text-ink-800">{value}</dd>
    </div>
  );
}

function InfraRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded border border-ink-100 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.82rem] font-semibold text-ink-800">{label}</span>
        <Badge tone={ok ? 'green' : 'yellow'}>{ok ? 'Configurado' : 'Pendente'}</Badge>
      </div>
      <p className="mt-1.5 text-[0.74rem] leading-relaxed text-ink-500">{detail}</p>
    </div>
  );
}
