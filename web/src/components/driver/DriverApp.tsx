'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatBRL, formatPhone } from '@/lib/utils';
import { DELIVERY_STATUS_LABEL } from '@/data/business-copy';
import {
  driverStepAction,
  sendDriverLocationAction,
  setMyDriverStatusAction,
} from '@/app/actions/orders';
import { logoutAction } from '@/app/actions/auth';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * APP DO ENTREGADOR
 * -----------------------------------------------------------------------
 * Porte do entregador.html: três abas (entregas, histórico, perfil),
 * cabeçalho com a marca da loja e o fluxo de passos da entrega.
 *
 * O QUE MUDOU EM RELAÇÃO AO HTML:
 *   • os pedidos vêm do banco, filtrados por driverId no servidor — o
 *     app não escolhe de quem são. Não existe caminho aqui que peça
 *     "todos os pedidos da loja";
 *   • cada passo é um server action que reconfere no `where` que o
 *     pedido é deste entregador. Trocar o id na requisição não abre
 *     a entrega de outra pessoa;
 *   • o status online/offline é do entregador logado (updateMany por
 *     organizationId + userId), não de um id vindo da tela.
 *
 * O QUE NÃO EXISTE AQUI (e o app diz isso, em vez de fingir):
 *   • rastreamento em segundo plano. O navegador não entrega posição
 *     com a aba fechada; o envio é manual e pontual;
 *   • foto e assinatura da prova. Dependem de um provedor de storage,
 *     que ainda não está contratado (ver src/lib/storage.ts). O nome de
 *     quem recebeu vai para as observações da entrega;
 *   • mapa de rota. Sem chave do Google Maps não há mapa — ver Expedição.
 * ═══════════════════════════════════════════════════════════════════════
 */

type Step = 'ARRIVED_STORE' | 'PICKED_UP' | 'STARTED' | 'ARRIVED_CUSTOMER' | 'DELIVERED';

export type DriverOrderItem = {
  id: string;
  productName: string;
  quantity: number;
  variationName: string | null;
  notes: string | null;
  options: Array<{ id: string; name: string }>;
};

export type DriverOrder = {
  id: string;
  displayId: number;
  status: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  deliveryFee: number;
  deliveryAddress: string;
  deliveryNumber: string | null;
  deliveryDistrict: string | null;
  deliveryCity: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  notes: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  items: DriverOrderItem[];
  delivery: {
    status: string;
    arrivedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
    proofType: string;
  } | null;
};

export type DriverIdentity = {
  name: string;
  vehicleType: string;
  vehiclePlate: string | null;
  status: string;
};

export type DriverStore = {
  name: string;
  logoUrl: string | null;
  brandColor: string;
  /** Coordenada da loja — para montar a rota no app de navegação. */
  latitude: number | null;
  longitude: number | null;
};

const VEHICLE_ICON: Record<string, string> = {
  MOTORCYCLE: '🏍️',
  CAR: '🚗',
  BICYCLE: '🚲',
  ON_FOOT: '🚶',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  ONLINE: 'Online',
  OTHER: 'Outro',
};

/**
 * Link de navegação externa.
 *
 * O mapa interno do app é visualização; quem navega é o aplicativo de mapa
 * do telefone (Google Maps ou Waze). A rota é montada por coordenadas
 * quando existem — nunca por uma coordenada inventada. Sem coordenada do
 * destino (ou da loja, para a primeira perna), degrada para busca pelo
 * endereço em texto.
 */
function navigationUrl(
  destination: {
    latitude: number | null;
    longitude: number | null;
    address: string;
  },
  origin?: { latitude: number | null; longitude: number | null },
): { google: string; waze: string } {
  const dest = destination.latitude != null && destination.longitude != null
    ? `${destination.latitude},${destination.longitude}`
    : encodeURIComponent(destination.address);
  const destLabel = encodeURIComponent(destination.address || 'Destino');

  const google =
    `https://www.google.com/maps/dir/?api=1&destination=${dest}` +
    (origin?.latitude != null && origin?.longitude != null
      ? `&origin=${origin.latitude},${origin.longitude}`
      : '');

  // Waze não aceita coordenadas no deep link `waze.to`; usa o endereço
  // como texto quando não há coordenada, senão a coordenada formatada.
  const wazeQuery = destination.latitude != null && destination.longitude != null
    ? `${destination.latitude}%2C${destination.longitude}`
    : destLabel;
  const waze = `https://waze.com/ul?q=${wazeQuery}&navigate=yes`;

  return { google, waze };
}

/**
 * Próximo passo a partir do estado da entrega.
 *
 * DOIS CUIDADOS QUE PARECEM DETALHE, MAS NÃO SÃO:
 *
 * 1. O status da Delivery é que manda, não o do Order — os dois divergem
 *    de propósito (um pedido DISPATCHED continua na lista até ser
 *    entregue, e o cancelamento mexe no Order sem tocar na Delivery).
 *
 * 2. `ASSIGNED` é ambíguo: é o estado em que o despacho deixa a entrega
 *    E também o estado depois de "cheguei na loja" — porque os dois
 *    gravam os mesmos campos, e o único que distingue é o `arrivedAt`.
 *    Sem essa checagem o app pularia "Cheguei na loja" e mandaria o
 *    entregador direto para "Retirei o pedido".
 */
function nextStep(delivery: DriverOrder['delivery']): Step {
  const status = delivery?.status ?? 'PENDING';

  if (status === 'DELIVERED' || status === 'FAILED') return 'DELIVERED';

  if (!delivery || status === 'PENDING' || status === 'ASSIGNED') {
    return delivery?.arrivedAt ? 'PICKED_UP' : 'ARRIVED_STORE';
  }

  if (status === 'PICKED_UP') return 'STARTED';
  if (status === 'IN_TRANSIT') return 'ARRIVED_CUSTOMER';
  if (status === 'ARRIVED') return 'DELIVERED';
  return 'DELIVERED';
}

const STEP_LABEL: Record<Step, string> = {
  ARRIVED_STORE: 'Cheguei na loja',
  PICKED_UP: 'Retirei o pedido',
  STARTED: 'Iniciei a rota',
  ARRIVED_CUSTOMER: 'Cheguei ao cliente',
  DELIVERED: 'Confirmar entrega',
};

const ALL_STEPS: Array<{ step: Step; label: string; done: (d: DriverOrder['delivery']) => boolean }> = [
  { step: 'ARRIVED_STORE', label: 'Na loja', done: (d) => Boolean(d?.arrivedAt) },
  {
    step: 'PICKED_UP',
    label: 'Retirado',
    done: (d) => Boolean(d?.pickedUpAt) || d?.status === 'PICKED_UP' || d?.status === 'IN_TRANSIT' || d?.status === 'ARRIVED' || d?.status === 'DELIVERED',
  },
  {
    step: 'STARTED',
    label: 'Em rota',
    done: (d) => d?.status === 'IN_TRANSIT' || d?.status === 'ARRIVED' || d?.status === 'DELIVERED',
  },
  {
    step: 'ARRIVED_CUSTOMER',
    label: 'No cliente',
    done: (d) => d?.status === 'ARRIVED' || d?.status === 'DELIVERED',
  },
  { step: 'DELIVERED', label: 'Entregue', done: (d) => d?.status === 'DELIVERED' },
];

export function DriverApp({
  driver,
  store,
  orders,
}: {
  driver: DriverIdentity;
  store: DriverStore;
  orders: DriverOrder[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'entregas' | 'historico' | 'perfil'>('entregas');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // "Agora" congelado na renderização — Date.now() no corpo do componente
  // mudaria a cada re-render e faria os minutos piscarem sem motivo.
  const [now] = useState(() => Date.now());

  // ── TEMPO REAL (estrutura de polling) ─────────────────────────────
  // O navegador não entrega GPS com a aba fechada, então não há
  // rastreamento contínuo de posição. Mas a LISTA pode se atualizar
  // sozinha: um pedido novo atribuído aparece sem o entregador tocar em
  // nada. Polling controlado (e interrompido ao sair da tela), não
  // long-polling nem websocket — é a estrutura simples e honesta.
  useEffect(() => {
    if (!document.hidden && tab !== 'perfil') {
      const timer = window.setInterval(() => {
        router.refresh();
      }, 30000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [router, tab]);

  const active = useMemo(
    () => orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'),
    [orders],
  );
  const done = useMemo(() => orders.filter((o) => o.status === 'DELIVERED'), [orders]);

  const totalRecebido = useMemo(
    () => done.reduce((acc, o) => acc + o.total, 0),
    [done],
  );

  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
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

  const isOnline = driver.status !== 'OFFLINE';

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col bg-ink-50">
      {/*
        Cabeçalho e abas grudam juntos, como um bloco só. Cada um com seu
        próprio `sticky top-*` exigiria cravar a altura do cabeçalho em
        pixels — e o nome da loja quebra em duas linhas em tela estreita,
        o que desalinharia as abas silenciosamente.
      */}
      <div className="sticky top-0 z-20">
        {/* ── CABEÇALHO ────────────────────────────────────────────── */}
        <header
          className="px-4 py-3 text-white shadow-sm"
          style={{ backgroundColor: store.brandColor || '#F15A24' }}
        >
          <div className="flex items-center gap-3">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logoUrl}
                alt={store.name}
                className="h-10 w-10 flex-shrink-0 rounded object-cover ring-2 ring-white/40"
              />
            ) : (
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-white/20 text-[0.95rem] font-extrabold ring-2 ring-white/30">
                {store.name.slice(0, 2).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] font-extrabold leading-tight">{driver.name}</p>
              <p className="flex items-center gap-1.5 text-[0.72rem] text-white/85">
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    isOnline ? 'bg-[#7BE495]' : 'bg-white/60',
                  )}
                />
                {driver.status === 'BUSY'
                  ? 'Em entrega'
                  : isOnline
                    ? 'Disponível'
                    : 'Offline'}
                <span className="text-white/50">•</span>
                <span className="truncate">{store.name}</span>
              </p>
            </div>

            <span className="flex-shrink-0 rounded-full bg-white/15 px-2 py-1 text-[0.72rem] font-bold">
              {VEHICLE_ICON[driver.vehicleType] ?? '🏍️'} {driver.vehiclePlate ?? '—'}
            </span>
          </div>
        </header>

        {/* ── ABAS ─────────────────────────────────────────────────── */}
        <nav className="flex border-b border-ink-100 bg-white">
          {(
            [
              ['entregas', 'Entregas', active.length],
              ['historico', 'Histórico', 0],
              ['perfil', 'Perfil', 0],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[0.8rem] font-bold transition-all',
                tab === key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-500 hover:text-ink-700',
              )}
            >
              {label}
              {count > 0 && (
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[0.65rem] font-extrabold text-white">
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 space-y-3 p-4 pb-24">
        {error && (
          <Alert tone="danger" title="Não foi possível concluir">
            {error}
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}

        {/* ── ENTREGAS ─────────────────────────────────────────────── */}
        {tab === 'entregas' && (
          <>
            {!isOnline && (
              <Alert tone="warn" title="Você está offline">
                Fique disponível para receber novas entregas.
              </Alert>
            )}

            {active.length === 0 ? (
              <Card>
                <EmptyState
                  icon="🛵"
                  title="Nenhuma entrega atribuída"
                  description="Quando a loja designar um pedido para você, ele aparece aqui. A tela não se atualiza sozinha: toque em Atualizar para buscar de novo."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                      ↻ Atualizar
                    </Button>
                  }
                />
              </Card>
            ) : (
              active.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  now={now}
                  disabled={pending}
                  onOpen={() => setOpenId(order.id)}
                  onStep={(step, notes) =>
                    run(
                      () => driverStepAction({ orderId: order.id, step, notes }),
                      () => {
                        setNotice(
                          step === 'DELIVERED'
                            ? `Entrega do pedido #${order.displayId} confirmada.`
                            : `Passo registrado: ${STEP_LABEL[step]}.`,
                        );
                        if (step === 'DELIVERED') setOpenId(null);
                      },
                    )
                  }
                />
              ))
            )}

            <LocationCard disabled={pending} onSend={(coords) => run(() => sendDriverLocationAction(coords))} />
          </>
        )}

        {/* ── HISTÓRICO ────────────────────────────────────────────── */}
        {tab === 'historico' && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat value={String(done.length)} label="Entregues" />
              <MiniStat value={formatBRL(totalRecebido)} label="Total" />
              <MiniStat value={String(active.length)} label="Em aberto" />
            </div>

            <p className="px-1 text-[0.72rem] leading-relaxed text-ink-400">
              As últimas 50 entregas atribuídas a você. Valores são dos pedidos, não repasse de
              comissão — o cálculo de repasse ainda não existe no sistema.
            </p>

            {done.length === 0 ? (
              <Card>
                <EmptyState icon="📭" title="Nada entregue ainda" />
              </Card>
            ) : (
              done.map((order) => (
                <Card key={order.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.86rem] font-bold text-ink-900">
                        #{order.displayId} — {order.customerName}
                      </p>
                      <p className="mt-0.5 text-[0.74rem] text-ink-500">
                        {order.deliveredAt
                          ? new Date(order.deliveredAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                        {order.deliveryDistrict ? ` • ${order.deliveryDistrict}` : ''}
                      </p>
                    </div>
                    <Badge tone="green">{formatBRL(order.total)}</Badge>
                  </div>
                </Card>
              ))
            )}
          </>
        )}

        {/* ── PERFIL ───────────────────────────────────────────────── */}
        {tab === 'perfil' && (
          <>
            <Card>
              <div className="text-center">
                <span className="mx-auto flex h-[74px] w-[74px] items-center justify-center rounded-full bg-brand-light text-[1.4rem] font-extrabold text-brand">
                  {driver.name.slice(0, 2).toUpperCase()}
                </span>
                <p className="mt-2 text-[1.05rem] font-bold text-ink-900">{driver.name}</p>
                <p className="text-[0.76rem] text-ink-400">
                  {VEHICLE_ICON[driver.vehicleType] ?? '🏍️'}{' '}
                  {driver.vehiclePlate ?? 'sem placa cadastrada'} • {store.name}
                </p>
              </div>
            </Card>

            <Card>
              <p className="mb-3 text-[0.86rem] font-bold text-ink-900">Minha disponibilidade</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['ONLINE', '📡', 'Disponível'],
                    ['RETURNING', '↩️', 'Retornando'],
                    ['OFFLINE', '⏸', 'Offline'],
                  ] as const
                ).map(([status, icon, label]) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setMyDriverStatusAction(status), () =>
                        setNotice(`Você está ${label.toLowerCase()}.`),
                      )
                    }
                    className={cn(
                      'rounded-lg border-2 px-2 py-3 text-[0.74rem] font-bold transition-all disabled:opacity-55',
                      driver.status === status
                        ? 'border-brand bg-brand-light text-brand'
                        : 'border-ink-200 bg-white text-ink-600 hover:border-brand',
                    )}
                  >
                    <span className="mb-1 block text-[1.1rem]">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[0.72rem] leading-relaxed text-ink-400">
                &quot;Em entrega&quot; é definido pelo sistema ao atribuir um pedido a você — não dá
                para escolher à mão.
              </p>
            </Card>

            <Alert tone="neutral" title="Sobre este app">
              Instale na tela inicial para abrir em tela cheia. A posição só é enviada quando você
              toca em &quot;Enviar minha localização&quot; (ou ao iniciar a rota): o navegador não
              entrega GPS com a aba fechada, então não há rastreamento contínuo. Foto e assinatura
              da prova de entrega dependem de um provedor de armazenamento ainda não configurado.
            </Alert>

            <button
              type="button"
              disabled={pending}
              // Mesmo logout do painel: encerra a sessão no servidor e
              // redireciona. Não é limpeza de estado no navegador.
              onClick={() =>
                startTransition(async () => {
                  await logoutAction();
                })
              }
              className="w-full rounded-lg border-2 border-danger/30 bg-danger-bg py-3 text-[0.86rem] font-bold text-danger transition-all hover:border-danger disabled:opacity-55"
            >
              Sair da conta
            </button>
          </>
        )}
      </main>

      {/* ── DETALHE DA ENTREGA ─────────────────────────────────────── */}
      {openOrder && (
        <OrderSheet
          order={openOrder}
          store={store}
          disabled={pending}
          onClose={() => setOpenId(null)}
          onStep={(step, notes) =>
            run(
              () => driverStepAction({ orderId: openOrder.id, step, notes }),
              () => {
                setNotice(`Passo registrado: ${STEP_LABEL[step]}.`);
                if (step === 'DELIVERED') setOpenId(null);
              },
            )
          }
        />
      )}
    </div>
  );
}

// ── CARTÃO DE ENTREGA ────────────────────────────────────────────────────

function OrderCard({
  order,
  now,
  disabled,
  onOpen,
  onStep,
}: {
  order: DriverOrder;
  now: number;
  disabled: boolean;
  onOpen: () => void;
  onStep: (step: Step, notes?: string) => void;
}) {
  const step = nextStep(order.delivery);
  const isDelivery = step === 'DELIVERED';
  const cobrar =
    order.paymentMethod === 'CASH' && order.paymentStatus !== 'PAID' ? order.total : null;

  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
  const late = minutes >= 30 && !isDelivery;

  return (
    <Card className={cn('p-4', late && 'border-warn/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-extrabold text-ink-900">#{order.displayId}</p>
          <p className="truncate text-[0.82rem] font-semibold text-ink-700">{order.customerName}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Badge tone={isDelivery ? 'green' : late ? 'yellow' : 'orange'}>
            {isDelivery
              ? 'Entregue'
              : order.delivery
                ? DELIVERY_STATUS_LABEL[order.delivery.status] ?? order.delivery.status
                : 'Atribuída'}
          </Badge>
          <span className="text-[0.68rem] text-ink-400">
            {minutes < 1 ? 'agora' : `há ${minutes} min`}
          </span>
        </div>
      </div>

      <p className="mt-2.5 text-[0.8rem] leading-relaxed text-ink-600">
        📍 {order.deliveryAddress}
        {order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}
        {order.deliveryDistrict ? ` — ${order.deliveryDistrict}` : ''}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">
          {order.items.reduce((acc, i) => acc + i.quantity, 0)} itens
        </Badge>
        <Badge tone="neutral">{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}</Badge>
        {cobrar !== null && <Badge tone="yellow">Cobrar {formatBRL(cobrar)}</Badge>}
        {order.paymentStatus === 'PAID' && <Badge tone="green">Pago</Badge>}
      </div>

      {cobrar !== null && (
        <p className="mt-2 text-[0.74rem] leading-relaxed text-warn">
          Pagamento em dinheiro na entrega. O pedido é marcado como pago quando você confirma a
          entrega.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onOpen} className="flex-1">
          Detalhes
        </Button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onStep(step)}
          className={cn(
            'flex-1 rounded-sm px-3.5 py-2 text-[0.78rem] font-bold text-white transition-all disabled:opacity-55',
            isDelivery ? 'bg-success' : 'bg-brand hover:bg-brand-dark',
          )}
        >
          {STEP_LABEL[step]}
        </button>
      </div>

      <div className="mt-3 flex gap-1">
        {ALL_STEPS.map((s) => (
          <span
            key={s.step}
            title={s.label}
            className={cn(
              'h-1 flex-1 rounded-full',
              s.done(order.delivery) ? 'bg-success' : 'bg-ink-100',
            )}
          />
        ))}
      </div>
    </Card>
  );
}

// ── DETALHE (folha inferior) ─────────────────────────────────────────────

function OrderSheet({
  order,
  store,
  disabled,
  onClose,
  onStep,
}: {
  order: DriverOrder;
  store: DriverStore;
  disabled: boolean;
  onClose: () => void;
  onStep: (step: Step, notes?: string) => void;
}) {
  const step = nextStep(order.delivery);
  const [receiver, setReceiver] = useState('');
  const phone = order.customerPhone.replace(/\D/g, '');
  const jaEntregue = order.status === 'DELIVERED';

  const destination = {
    latitude: order.deliveryLatitude,
    longitude: order.deliveryLongitude,
    address: [
      order.deliveryAddress,
      order.deliveryNumber,
      order.deliveryDistrict,
      order.deliveryCity,
    ]
      .filter(Boolean)
      .join(', '),
  };
  const route = navigationUrl(destination, {
    latitude: store.latitude,
    longitude: store.longitude,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Entrega ${order.displayId}`}
        className="max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 animate-fade-in"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1.05rem] font-extrabold text-ink-900">Entrega #{order.displayId}</h2>
            <p className="mt-0.5 text-[0.76rem] text-ink-500">
              {order.delivery ? DELIVERY_STATUS_LABEL[order.delivery.status] : 'Atribuída'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-400 hover:bg-ink-100"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-ink-100 bg-ink-50 p-3.5">
          <p className="text-[0.84rem] font-bold text-ink-900">{order.customerName}</p>
          <p className="mt-0.5 text-[0.78rem] text-ink-500">{formatPhone(order.customerPhone)}</p>
          <div className="mt-2.5 flex gap-2">
            <a
              href={`tel:${phone}`}
              className="rounded-sm border-2 border-ink-200 bg-white px-3 py-1.5 text-[0.74rem] font-semibold text-ink-700 hover:border-brand hover:text-brand"
            >
              📞 Ligar
            </a>
            <a
              href={`https://wa.me/55${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border-2 border-ink-200 bg-white px-3 py-1.5 text-[0.74rem] font-semibold text-ink-700 hover:border-brand hover:text-brand"
            >
              💬 WhatsApp
            </a>
          </div>

          {/*
            Navegação externa: o app não desenha a rota — quem navega é o
            mapa do telefone. Dois botões (Google Maps e Waze) montados por
            coordenadas reais quando existem; senão, busca pelo endereço.
          */}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <a
              href={route.google}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm bg-brand px-3 py-2 text-center text-[0.74rem] font-bold text-white hover:bg-brand-dark"
            >
              🧭 ABRIR ROTA
            </a>
            <a
              href={route.waze}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border-2 border-ink-200 bg-white px-3 py-2 text-center text-[0.74rem] font-bold text-ink-700 hover:border-brand hover:text-brand"
            >
              🚙 Waze
            </a>
          </div>
        </div>

        <p className="mb-1 text-[0.78rem] font-bold text-ink-700">Endereço</p>
        <p className="mb-4 text-[0.82rem] leading-relaxed text-ink-600">
          {order.deliveryAddress}
          {order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}
          {order.deliveryDistrict ? ` — ${order.deliveryDistrict}` : ''}
          {order.deliveryCity ? `, ${order.deliveryCity}` : ''}
        </p>

        <p className="mb-1.5 text-[0.78rem] font-bold text-ink-700">
          Itens ({order.items.length})
        </p>
        <ul className="mb-4 divide-y divide-ink-100 rounded-lg border border-ink-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-[0.82rem] font-semibold text-ink-800">
                  {item.quantity}× {item.productName}
                </p>
                {item.variationName && (
                  <p className="text-[0.72rem] text-ink-500">{item.variationName}</p>
                )}
                {item.options.length > 0 && (
                  <p className="text-[0.72rem] text-ink-500">
                    {item.options.map((o) => o.name).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-0.5 text-[0.72rem] italic text-ink-400">“{item.notes}”</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-ink-50 px-3.5 py-3">
          <span className="text-[0.82rem] font-semibold text-ink-700">Total do pedido</span>
          <span className="text-[1rem] font-extrabold text-ink-900">{formatBRL(order.total)}</span>
        </div>

        {order.notes && (
          <Alert tone="warn" title="Observação do pedido" className="mb-4">
            {order.notes}
          </Alert>
        )}

        {jaEntregue ? (
          // Já fechada: não oferece de novo o botão de confirmar. A folha
          // pode ficar aberta enquanto a loja ou outro aparelho conclui o
          // pedido, e reconfirmar sobrescreveria o horário da entrega.
          <Alert tone="success" title="Entrega concluída">
            {order.deliveredAt
              ? `Registrada em ${new Date(order.deliveredAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}.`
              : 'Este pedido já foi marcado como entregue.'}
          </Alert>
        ) : step === 'DELIVERED' ? (
          <>
            <label className="field-label">Nome de quem recebeu (opcional)</label>
            <Input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="Ex.: Maria, porteiro…"
              className="mb-3"
            />
            <p className="mb-4 text-[0.72rem] leading-relaxed text-ink-400">
              Vai para as observações da entrega. A foto e a assinatura da prova dependem de um
              provedor de armazenamento ainda não configurado — por isso não são pedidas aqui.
            </p>
            <Button
              variant="success"
              fullWidth
              disabled={disabled}
              onClick={() => onStep('DELIVERED', receiver.trim() || undefined)}
            >
              ✅ Confirmar entrega
            </Button>
          </>
        ) : (
          <Button fullWidth disabled={disabled} onClick={() => onStep(step)}>
            {STEP_LABEL[step]}
          </Button>
        )}

        {order.delivery?.notes && (
          <p className="mt-4 text-[0.74rem] leading-relaxed text-ink-400">
            Registro anterior: {order.delivery.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ── LOCALIZAÇÃO ──────────────────────────────────────────────────────────

function LocationCard({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (coords: { latitude: number; longitude: number; accuracy?: number }) => void;
}) {
  const [state, setState] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(
    null,
  );

  function locate() {
    setState('Buscando sinal…');
    setCoords(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState('Este dispositivo não expõe geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setCoords(next);
        setState(
          `📍 ${next.latitude.toFixed(5)}, ${next.longitude.toFixed(5)}` +
            (next.accuracy ? ` (±${Math.round(next.accuracy)} m)` : ''),
        );
      },
      (err) => {
        setState(
          err.code === err.PERMISSION_DENIED
            ? 'Permissão de localização negada.'
            : 'Não foi possível obter a posição.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <Card className="p-4">
      <p className="text-[0.86rem] font-bold text-ink-900">Minha localização</p>
      <p className="mt-1 text-[0.74rem] leading-relaxed text-ink-500">
        Envia a posição atual para o painel da loja. É um envio pontual — o navegador não manda GPS
        com a tela fechada, então não há rastreamento contínuo.
      </p>

      {state && <p className="mt-2.5 text-[0.78rem] font-semibold text-ink-700">{state}</p>}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" onClick={locate} disabled={disabled} className="flex-1">
          Onde estou
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={disabled || !coords}
          onClick={() => {
            if (!coords) return;
            onSend(coords);
          }}
        >
          Enviar para a loja
        </Button>
      </div>
    </Card>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-3 py-3 text-center">
      <p className="text-[1.05rem] font-extrabold leading-none text-ink-900">{value}</p>
      <p className="mt-1 text-[0.68rem] font-medium text-ink-500">{label}</p>
    </div>
  );
}
