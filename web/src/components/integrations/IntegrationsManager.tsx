'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatDateTime } from '@/lib/utils';
import {
  disconnectIntegrationAction,
  saveIntegrationCredentialAction,
  setIntegrationStatusAction,
} from '@/app/actions/integrations';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Tabs,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * INTEGRAÇÕES
 * -----------------------------------------------------------------------
 * Esta tela é honesta sobre o próprio estado: ela guarda credenciais e
 * registra eventos de webhook, mas NÃO sincroniza pedido com iFood ou
 * 99Food — os adapters não estão implementados.
 *
 * Por isso o status "Conectado" aparece como declaração do lojista, com
 * o aviso ao lado, e não como um selo verde de "tudo funcionando". Fingir
 * sincronização seria pior que dizer que ela não existe.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type IntegrationRow = {
  id: string;
  provider: string;
  status: string;
  externalMerchantId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  credentials: Array<{ id: string; hint: string | null; updatedAt: string }>;
  events: { pending: number; failed: number; processed: number };
};

export type IntegrationEventRow = {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  status: string;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
};

type ProviderMeta = {
  key: string;
  name: string;
  emoji: string;
  blurb: string;
  /** Campos que a credencial costuma exigir. */
  fields: Array<{ key: string; label: string; hint?: string; secret?: boolean }>;
  /** O que já funciona e o que ainda não. Escrito sem eufemismo. */
  implemented: string;
  pending: string;
};

const PROVIDERS: ProviderMeta[] = [
  {
    key: 'IFOOD',
    name: 'iFood',
    emoji: '🍽️',
    blurb: 'Receber pedidos do iFood dentro da Central de Pedidos.',
    fields: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
      { key: 'merchantId', label: 'Merchant ID', hint: 'Identificador da loja no iFood.' },
    ],
    implemented:
      'O modelo de dados (integração, credencial cifrada, eventos idempotentes) está pronto.',
    pending:
      'O adapter que busca e converte pedidos do iFood ainda não foi implementado. Nenhum pedido é importado hoje.',
  },
  {
    key: 'FOOD99',
    name: '99Food',
    emoji: '🛵',
    blurb: 'Receber pedidos do 99Food no mesmo painel.',
    fields: [
      { key: 'appId', label: 'App ID' },
      { key: 'appSecret', label: 'App Secret', secret: true },
      { key: 'storeId', label: 'Store ID' },
    ],
    implemented: 'Mesma base do iFood: credencial cifrada e registro de eventos.',
    pending: 'Adapter não implementado. Nenhum pedido é importado hoje.',
  },
  {
    key: 'ZE_DELIVERY',
    name: 'Zé Delivery',
    emoji: '🍺',
    blurb: 'Catálogo e pedidos do Zé Delivery.',
    fields: [
      { key: 'apiKey', label: 'API Key', secret: true },
      { key: 'merchantId', label: 'Merchant ID' },
    ],
    implemented: 'Estrutura de credencial pronta.',
    pending:
      'Adapter não implementado. Foi do catálogo do Zé Delivery que saíram as fotos da biblioteca — mas isso é acervo de imagens, não integração ao vivo.',
  },
  {
    key: 'GOOGLE_MAPS',
    name: 'Google Maps',
    emoji: '🗺️',
    blurb: 'Cálculo de frete por distância real e mapa da expedição.',
    fields: [{ key: 'apiKey', label: 'API Key', secret: true }],
    implemented:
      'A taxa base e o raio já funcionam. O cálculo por distância usa as coordenadas da loja quando existirem.',
    pending:
      'Sem a chave, não há geocodificação de endereço nem mapa de ruas — a Expedição mostra um radar de posições relativas. Também não há cobrança de rota real.',
  },
];

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'neutral'> = {
  ACTIVE: 'green',
  PENDING: 'yellow',
  ERROR: 'red',
  DISCONNECTED: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Conectado',
  PENDING: 'Pendente',
  ERROR: 'Com erro',
  DISCONNECTED: 'Não conectado',
};

export function IntegrationsManager({
  integrations,
  events,
  canManage,
  encryptionReady,
}: {
  integrations: IntegrationRow[];
  events: IntegrationEventRow[];
  canManage: boolean;
  /**
   * TOKEN_ENCRYPTION_KEY existe? Se não existir, a gravação de credencial
   * falha no servidor de propósito — a tela avisa antes para não parecer
   * um bug quando o botão recusar.
   */
  encryptionReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'providers' | 'events'>('providers');
  const [configTarget, setConfigTarget] = useState<ProviderMeta | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<ProviderMeta | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível concluir.');
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}

      {!encryptionReady && (
        <Alert tone="warn" title="Gravação de credencial desligada">
          A variável <code>TOKEN_ENCRYPTION_KEY</code> não está configurada neste ambiente. O
          sistema recusa gravar credencial de terceiro sem cifragem — em vez de guardar o segredo em
          texto puro no banco. Gere uma chave com <code>openssl rand -base64 32</code> e reinicie
          para habilitar.
        </Alert>
      )}

      <Alert tone="neutral" title="O que esta área faz hoje">
        Ela guarda credenciais com segurança e registra os eventos de webhook que chegam —
        <strong> de forma idempotente</strong>, ou seja, o mesmo evento repetido não vira dois
        pedidos. O que ainda <strong>não</strong> existe é a busca ativa de pedidos em cada
        marketplace. Cada provedor abaixo diz exatamente o que está pronto e o que falta.
      </Alert>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'providers', label: 'Provedores', count: integrations.length },
          { value: 'events', label: 'Eventos recebidos', count: events.length },
        ]}
      />

      {tab === 'providers' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {PROVIDERS.map((meta) => {
            const row = integrations.find((i) => i.provider === meta.key);
            const connected = row?.status === 'ACTIVE';
            const hint = row?.credentials[0]?.hint;

            return (
              <Card key={meta.key}>
                <CardHeader
                  title={`${meta.emoji} ${meta.name}`}
                  subtitle={meta.blurb}
                  action={
                    <Badge tone={STATUS_TONE[row?.status ?? 'DISCONNECTED'] ?? 'neutral'}>
                      {STATUS_LABEL[row?.status ?? 'DISCONNECTED'] ?? row?.status ?? 'Não conectado'}
                    </Badge>
                  }
                />

                {hint && (
                  <p className="mb-3 text-[0.76rem] text-ink-500">
                    Credencial gravada: <code className="font-bold">{hint}</code>
                    {row?.credentials[0]?.updatedAt && (
                      <> · atualizada em {formatDateTime(row.credentials[0].updatedAt)}</>
                    )}
                  </p>
                )}

                {row?.lastError && (
                  <Alert tone="danger" title="Último erro registrado">
                    {row.lastError}
                  </Alert>
                )}

                {row && (row.events.pending > 0 || row.events.failed > 0) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.events.pending > 0 && (
                      <Badge tone="yellow">{row.events.pending} evento(s) aguardando</Badge>
                    )}
                    {row.events.failed > 0 && (
                      <Badge tone="red">{row.events.failed} evento(s) com falha</Badge>
                    )}
                    {row.events.processed > 0 && (
                      <Badge tone="green">{row.events.processed} processado(s)</Badge>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <p className="rounded border border-success/25 bg-success-bg px-3 py-2 text-[0.74rem] text-success">
                    <strong>Pronto:</strong> {meta.implemented}
                  </p>
                  <p className="rounded border border-warn/25 bg-warn-bg px-3 py-2 text-[0.74rem] text-warn">
                    <strong>Falta:</strong> {meta.pending}
                  </p>
                </div>

                {canManage && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-3.5">
                    <Button size="sm" onClick={() => setConfigTarget(meta)} disabled={pending}>
                      {hint ? 'Trocar credencial' : 'Configurar'}
                    </Button>

                    {/*
                      Marcar como conectado é DECLARAÇÃO do lojista, não
                      constatação do sistema — o texto do aviso abaixo diz
                      isso. Sem este botão, a credencial ficaria gravada e o
                      status preso em "Pendente" para sempre.
                    */}
                    {hint && row?.status !== 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setIntegrationStatusAction({
                                provider: meta.key as 'IFOOD',
                                status: 'ACTIVE',
                              }),
                            () =>
                              setNotice(
                                `${meta.name} marcado como conectado. Isso é uma declaração sua — o sistema ainda não testa a credencial contra o provedor.`,
                              ),
                          )
                        }
                      >
                        Marcar como conectado
                      </Button>
                    )}

                    {row?.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              setIntegrationStatusAction({
                                provider: meta.key as 'IFOOD',
                                status: 'PENDING',
                              }),
                            () => setNotice(`${meta.name} voltou para pendente.`),
                          )
                        }
                      >
                        Marcar como pendente
                      </Button>
                    )}

                    {/*
                      Um botão só para desligar. Existiam dois — "Desconectar"
                      (mudava o status) e "Apagar credencial" (apagava) — e a
                      diferença entre eles não era visível na tela. Agora é uma
                      ação só, com o efeito descrito por extenso na confirmação.
                    */}
                    {(hint || (row && row.status !== 'DISCONNECTED')) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDisconnectTarget(meta)}
                      >
                        Desconectar
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'events' && (
        <Card>
          <CardHeader
            title="Eventos recebidos"
            subtitle="Webhooks que chegaram da plataforma — a chave de idempotência é (loja, provedor, id do evento)"
          />
          {events.length === 0 ? (
            <p className="py-8 text-center text-[0.84rem] text-ink-400">
              Nenhum evento recebido ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-100 text-left">
                    <Th>Provedor</Th>
                    <Th>Evento</Th>
                    <Th>ID externo</Th>
                    <Th>Recebido</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="py-2.5 pr-4 text-[0.8rem] text-ink-700">{event.provider}</td>
                      <td className="py-2.5 pr-4 text-[0.8rem] text-ink-700">{event.eventType}</td>
                      <td className="max-w-[200px] truncate py-2.5 pr-4 text-[0.74rem] text-ink-400">
                        {event.externalEventId}
                      </td>
                      <td className="py-2.5 pr-4 text-[0.74rem] text-ink-500">
                        {formatDateTime(event.receivedAt)}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          tone={
                            event.status === 'PROCESSED'
                              ? 'green'
                              : event.status === 'FAILED'
                                ? 'red'
                                : event.status === 'IGNORED'
                                  ? 'neutral'
                                  : 'yellow'
                          }
                        >
                          {event.status}
                        </Badge>
                        {event.error && (
                          <p className="mt-1 max-w-[260px] text-[0.7rem] text-danger">{event.error}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {configTarget && (
        <CredentialModal
          meta={configTarget}
          pending={pending}
          encryptionReady={encryptionReady}
          onClose={() => setConfigTarget(null)}
          onSubmit={(formData) =>
            run(
              () => saveIntegrationCredentialAction(formData),
              () => {
                setConfigTarget(null);
                setNotice(
                  `Credencial de ${configTarget.name} gravada. Ela não é verificada contra o provedor — isso depende do adapter, que ainda não existe.`,
                );
              },
            )
          }
        />
      )}

      {disconnectTarget && (
        <Modal
          open
          onClose={() => setDisconnectTarget(null)}
          title={`Desconectar ${disconnectTarget.name}`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDisconnectTarget(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() =>
                  run(
                    () => disconnectIntegrationAction(disconnectTarget.key as 'IFOOD'),
                    () => {
                      setDisconnectTarget(null);
                      setNotice('Credencial apagada e integração desconectada.');
                    },
                  )
                }
              >
                Desconectar
              </Button>
            </>
          }
        >
          <p className="text-[0.84rem] leading-relaxed text-ink-600">
            A credencial cifrada é <strong>apagada do banco</strong> — não fica guardada para uma
            reconexão futura. Para voltar a usar, será preciso informar os dados de novo.
          </p>
          <p className="mt-3 text-[0.8rem] text-ink-500">
            O histórico de eventos recebidos <strong>permanece</strong>: ele é a trilha de auditoria
            do que já entrou pelo webhook.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── MODAL DE CREDENCIAL ────────────────────────────────────────────────

function CredentialModal({
  meta,
  pending,
  encryptionReady,
  onClose,
  onSubmit,
}: {
  meta: ProviderMeta;
  pending: boolean;
  encryptionReady: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  // Começa vazio: nunca preenchemos com o valor real — ele não sai do
  // servidor. O que a tela conhece é apenas a máscara.
  const filled = meta.fields.every((field) => (values[field.key] ?? '').trim().length > 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Credencial — ${meta.name}`}
      subtitle="Os valores são cifrados antes de chegar ao banco."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={!filled || !encryptionReady}
            onClick={() => {
              const fd = new FormData();
              fd.set('provider', meta.key);
              fd.set('payload', JSON.stringify(values));
              onSubmit(fd);
            }}
          >
            Gravar credencial
          </Button>
        </>
      }
    >
      {!encryptionReady && (
        <Alert tone="warn">
          Sem <code>TOKEN_ENCRYPTION_KEY</code> configurada, o sistema recusa gravar. Este botão
          não vai funcionar até a chave existir.
        </Alert>
      )}

      {meta.fields.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint} required>
          <Input
            type={field.secret ? 'password' : 'text'}
            value={values[field.key] ?? ''}
            onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      ))}

      <Alert tone="neutral" title="O que acontece depois de gravar">
        A credencial fica guardada (cifrada) e a integração passa a <strong>Pendente</strong>. O
        status só vira <strong>Conectado</strong> quando você marcar manualmente — o sistema ainda
        não tem como testar a credencial contra o provedor, porque o adapter não foi implementado.
        Não confundimos "guardei os dados" com "está funcionando".
      </Alert>

      <p className="mt-3 text-[0.72rem] text-ink-400">
        A máscara exibida depois da gravação serve só para você reconhecer qual credencial está lá.
        Os últimos dígitos aparecem; o restante nunca volta para o navegador.
      </p>
    </Modal>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500',
        className,
      )}
    >
      {children}
    </th>
  );
}
