'use client';

import { Bike, Car, Footprints, MapPin, Navigation, CheckCircle2, Package, Map as MapIcon, History, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { whatsappHref } from '@/lib/whatsapp';
import { cn, formatBRL, formatPhone } from '@/lib/utils';
import { DELIVERY_STATUS_LABEL } from '@/data/business-copy';
import {
  driverStepAction,
  setMyDriverStatusAction,
} from '@/app/actions/orders';
import { driverLogoutAction as logoutAction } from '@/app/actions/auth';
import { reportFailedDeliveryAction } from '@/app/actions/drivers';
import { Alert, Badge, Button, Card, EmptyState, Input } from '@/components/ui';
import { DriverInstallCard } from '@/components/driver/DriverInstall';
import { DriverScheduleNotice } from '@/components/driver/DriverScheduleNotice';
import { DriverNavigation } from '@/components/driver/DriverNavigation';
import { DriverRoutes } from '@/components/driver/DriverRoutes';
import { useLiveRefresh } from '@/components/layout/LiveRefresh';
import { requestDriverLocation, useDriverLocationPref } from '@/lib/driver-location-pref';

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
  /** Escala do dia (informativa: não bloqueia receber entregas). */
  onShift?: boolean;
  shiftLabel?: string;
};

export type DriverStore = {
  name: string;
  logoUrl: string | null;
  brandColor: string;
  /** Coordenada da loja — para montar a rota no app de navegação. */
  latitude: number | null;
  longitude: number | null;
};

function VehicleIcon({ type }: { type: string }) {
  const Icon = type === 'CAR' ? Car : type === 'ON_FOOT' ? Footprints : Bike;
  return <Icon className="inline-block align-middle" size={17} aria-hidden="true" />;
}

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  ONLINE: 'Online',
  OTHER: 'Outro',
};

export { navigationUrl } from '@/lib/driver-nav-url';
import { navigationUrl } from '@/lib/driver-nav-url';

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
/** Atribuído durante o aceite ou a separação: a loja ainda não liberou a retirada. */
const awaitingRelease = (order: { status: string }) => order.status === 'CONFIRMED' || order.status === 'PREPARING';

function nextStep(delivery: DriverOrder['delivery']): Step {
  const status = delivery?.status ?? 'PENDING';

  if (status === 'DELIVERED' || status === 'FAILED') return 'DELIVERED';

  // A retirada é o primeiro passo: a loja libera e o entregador confirma.
  if (!delivery || status === 'PENDING' || status === 'ASSIGNED') return 'PICKED_UP';

  if (status === 'PICKED_UP') return 'STARTED';
  if (status === 'IN_TRANSIT') return 'ARRIVED_CUSTOMER';
  if (status === 'ARRIVED') return 'DELIVERED';
  return 'DELIVERED';
}

const STEP_LABEL: Record<Step, string> = {
  ARRIVED_STORE: 'Cheguei na loja',
  PICKED_UP: 'Confirmar retirada',
  STARTED: 'Ir para entrega',
  ARRIVED_CUSTOMER: 'Cheguei ao cliente',
  DELIVERED: 'Confirmar entrega',
};

const ALL_STEPS: Array<{ step: Step; label: string; done: (d: DriverOrder['delivery']) => boolean }> = [
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
  useLiveRefresh('/api/entregador/versao', 8000);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'entregas' | 'rotas' | 'historico' | 'perfil'>('entregas');
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  // "Agora" congelado na renderização — Date.now() no corpo do componente
  // mudaria a cada re-render e faria os minutos piscarem sem motivo.
  const [now, setNow] = useState(() => Date.now());

  // ── TEMPO REAL (estrutura de polling) ─────────────────────────────
  // O navegador não entrega GPS com a aba fechada, então não há
  // rastreamento contínuo de posição. Mas a LISTA pode se atualizar
  // sozinha: um pedido novo atribuído aparece sem o entregador tocar em
  // nada. Polling controlado (e interrompido ao sair da tela), não
  // long-polling nem websocket — é a estrutura simples e honesta.
  useEffect(() => {
    // Novas atribuições chegam pela versão leve (useLiveRefresh); aqui só
    // o relógio e o estado da conexão.
    const refresh = () => {
      setOnline(navigator.onLine);
      setNow(Date.now());
    };
    setOnline(navigator.onLine);
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const active = useMemo(
    () => orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'),
    [orders],
  );
  const done = useMemo(() => orders.filter((o) => o.status === 'DELIVERED'), [orders]);

  const totalRecebido = useMemo(
    () => done.reduce((acc, o) => acc + o.total, 0),
    [done],
  );

  const doneToday = useMemo(() => {
    const today = new Date().toDateString();
    return done.filter((o) => o.deliveredAt && new Date(o.deliveredAt).toDateString() === today).length;
  }, [done]);

  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let result;
      try { result = await action(); } catch {
        setError('Não foi possível conectar. Confira sua conexão e atualize antes de tentar novamente.');
        return;
      }
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível concluir.');
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  // Online/offline é escolha do entregador; a escala é só informativa.
  const isOnline = active.length > 0 || driver.status !== 'OFFLINE';
  const availability = active.length > 0 ? 'Em entrega' : isOnline ? 'Online · recebendo entregas' : 'Offline';

  // Sem botão de online: abrir o app deixa o entregador disponível para a loja.
  useEffect(() => {
    if (driver.status === 'OFFLINE') void setMyDriverStatusAction('ONLINE').then(() => router.refresh()).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderOrder = (order: DriverOrder) => (
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
            setNotice(step === 'DELIVERED' ? `Entrega do pedido #${order.displayId} confirmada.` : `Passo registrado: ${STEP_LABEL[step]}.`);
            if (step === 'DELIVERED') setOpenId(null);
            if (step === 'STARTED') { setOpenId(null); setNavTarget(order.id); setTab('rotas'); }
          },
        )
      }
    />
  );

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
          className="border-b border-ink-100 bg-white px-4 pb-3 text-ink-900"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-3">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logoUrl}
                alt={store.name}
                className="h-10 w-10 flex-shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[0.95rem] font-bold text-white" style={{ backgroundColor: store.brandColor || '#087EA4' }}>
                {store.name.slice(0, 2).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-[1rem] font-bold leading-tight">{driver.name}</p>
              <p className="flex items-center gap-1.5 text-[0.76rem] text-ink-500">
                <span
                  className={cn(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    isOnline ? 'bg-success' : 'bg-ink-300',
                  )}
                />
                {availability}
                <span className="text-ink-300">•</span>
                <span className="truncate">{store.name}</span>
              </p>
            </div>

            <span className="flex-shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[0.74rem] font-bold text-ink-700">
              <VehicleIcon type={driver.vehicleType} /> {driver.vehiclePlate ?? '—'}
            </span>
          </div>
        </header>

      </div>

      <main className="flex-1 space-y-3 p-4 pb-28">
        {!online && <Alert tone="warn">Sem conexão. As entregas exibidas podem estar desatualizadas. Reconecte para registrar alterações.</Alert>}
        {error && (
          <Alert tone="danger" title="Não foi possível concluir">
            {error}
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}

        {/* ── MINHAS ENTREGAS ──────────────────────────────────────── */}
        {tab === 'entregas' && (
          <>
            <DriverScheduleNotice />
            <div className="grid grid-cols-3 gap-2.5">
              <MiniStat value={String(active.length)} label="Em aberto" />
              <MiniStat value={String(doneToday)} label="Entregues hoje" />
              <MiniStat value={formatBRL(active.filter((o) => o.paymentStatus === 'PENDING' && o.paymentMethod === 'CASH').reduce((acc, o) => acc + o.total, 0))} label="A cobrar" />
            </div>
            {active.length > 1 && <Button variant="secondary" className="w-full" onClick={() => setTab('rotas')}>Organizar a sequência no mapa</Button>}
            {active.length === 0 ? (
              <Card>
                <EmptyState
                  icon="🛵"
                  title="Nenhuma entrega atribuída"
                  description="Quando a loja atribuir um pedido para você, ele aparece aqui sozinho em poucos segundos, com esta tela aberta e conectada."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                      ↻ Atualizar
                    </Button>
                  }
                />
              </Card>
            ) : (
              active.map((order) => renderOrder(order))
            )}
          </>
        )}

        {/* ── MINHAS ROTAS ─────────────────────────────────────────── */}
        {tab === 'rotas' && (
          <DriverRoutes
            orders={active.map((o) => ({ ...o, stepLabel: o.delivery ? DELIVERY_STATUS_LABEL[o.delivery.status] ?? 'Atribuída' : 'Atribuída' }))}
            onOpenOrder={(id) => setOpenId(id)}
            onOpenSettings={() => setTab('perfil')}
            autoNavigate={navTarget}
          />
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
              Suas últimas 50 entregas. Os valores são dos pedidos; repasse e comissão são
              combinados diretamente com a loja.
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
                  <VehicleIcon type={driver.vehicleType} />{' '}
                  {driver.vehiclePlate ?? 'sem placa cadastrada'} • {store.name}
                </p>
              </div>
            </Card>

            <LocationSettingsCard />

            <DriverInstallCard />
            <Alert tone="neutral" title="Sobre este app">
              A loja vê se você está online e o andamento das entregas, nunca a sua localização.
              Mantenha a conexão para registrar alterações.
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

      {/* ── MENU INFERIOR (uso com uma mão) ──────────────────────── */}
      <nav aria-label="Menu do entregador" className="fixed inset-x-0 bottom-0 z-[900] border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {(
            [
              ['entregas', 'Entregas', Package, active.length],
              ['rotas', 'Rotas', MapIcon, 0],
              ['historico', 'Histórico', History, 0],
              ['perfil', 'Perfil', UserRound, 0],
            ] as const
          ).map(([key, label, Icon, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={cn('relative flex min-h-[60px] flex-col items-center justify-center gap-0.5 px-0.5 text-[0.66rem] font-bold leading-tight', tab === key ? 'text-brand' : 'text-ink-500')}
            >
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', tab === key && 'bg-brand-light')}><Icon size={19} aria-hidden /></span>
              <span className="max-w-full text-center leading-[1.05]">{label}</span>
              {count > 0 && <span className="absolute right-[18%] top-1.5 rounded-full bg-brand px-1.5 text-[0.6rem] font-extrabold text-white">{count}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* ── DETALHE DA ENTREGA ─────────────────────────────────────── */}
      {openOrder && (
        <OrderSheet
          order={openOrder}
          store={store}
          disabled={pending}
          onClose={() => setOpenId(null)}
          onFailure={(reason) => run(
            () => reportFailedDeliveryAction({ orderId: openOrder.id, reason }),
            () => { setNotice('Tentativa registrada. A loja recebeu o pedido para novo despacho.'); setOpenId(null); },
          )}
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
  const isDelivery = order.status === 'DELIVERED';
  const waitingStore = awaitingRelease(order);
  const cobrar =
    order.paymentMethod === 'CASH' && order.paymentStatus !== 'PAID' ? order.total : null;

  const minutes = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 60000));
  const late = minutes >= 30 && !isDelivery;

  return (
    <Card className={cn('p-4', late && 'border-warn/40')} data-testid="driver-order">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-extrabold text-ink-900">#{order.displayId}</p>
          <p className="truncate text-[0.82rem] font-semibold text-ink-700">{order.customerName}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Badge tone={isDelivery ? 'green' : waitingStore ? 'neutral' : late ? 'yellow' : 'orange'}>
            {isDelivery
              ? 'Finalizado'
              : waitingStore ? 'Aguardando liberação'
              : order.status === 'WAITING_DRIVER' && order.delivery?.status === 'ASSIGNED' ? 'Pronto para retirada'
              : order.delivery
                ? DELIVERY_STATUS_LABEL[order.delivery.status] ?? order.delivery.status
                : 'Atribuída'}
          </Badge>
          <span className="text-[0.68rem] text-ink-400">
            {minutes < 1 ? 'agora' : `há ${minutes} min`}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-brand-light/60 px-3 py-2.5" data-testid="driver-order-address">
        <MapPin className="mt-0.5 shrink-0 text-brand" size={18} aria-hidden="true" />
        <div className="min-w-0">
          <p className="break-words text-[0.92rem] font-bold leading-snug text-ink-900">{order.deliveryAddress}{order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}</p>
          {(order.deliveryDistrict || order.deliveryCity) && <p className="text-[0.76rem] text-ink-600">{[order.deliveryDistrict, order.deliveryCity].filter(Boolean).join(' · ')}</p>}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">
          {(() => { const n = order.items.reduce((acc, i) => acc + i.quantity, 0); return `${n} ${n === 1 ? 'item' : 'itens'}`; })()}
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

      <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
        <Button variant="secondary" onClick={onOpen} className="min-h-12 rounded-xl px-4">
          Detalhes
        </Button>
        <button
          type="button"
          disabled={disabled || waitingStore}
          onClick={() => onStep(step)}
          className={cn(
            'min-h-12 rounded-xl px-4 text-[0.9rem] font-bold text-white shadow-sm transition-all active:scale-[.98] disabled:opacity-55',
            step === 'DELIVERED' ? 'bg-success' : waitingStore ? 'bg-ink-400' : 'bg-brand hover:bg-brand-dark',
          )}
        >
          {waitingStore ? 'Aguardando a loja' : STEP_LABEL[step]}
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
  onFailure,
}: {
  order: DriverOrder;
  store: DriverStore;
  disabled: boolean;
  onClose: () => void;
  onStep: (step: Step, notes?: string) => void;
  onFailure: (reason: string) => void;
}) {
  const step = nextStep(order.delivery);
  const [receiver, setReceiver] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [navigating, setNavigating] = useState(false);
  const [useLocation] = useDriverLocationPref();
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
  const route = navigationUrl(destination);

  return (
    <div
      className="fixed inset-0 z-[950] flex items-end justify-center bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Entrega ${order.displayId}`}
        className="max-h-[88dvh] w-full max-w-[560px] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(2rem,env(safe-area-inset-bottom))] animate-fade-in"
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100"
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
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-ink-200 bg-white px-3 text-[0.82rem] font-semibold text-ink-700 hover:border-brand hover:text-brand"
            >
              📞 Ligar
            </a>
            <a
              href={whatsappHref(phone, `Olá, ${order.customerName.split(' ')[0]}! Sou o entregador da ${store.name} com o seu pedido #${order.displayId}.`) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 border-ink-200 bg-white px-3 text-[0.82rem] font-semibold text-ink-700 hover:border-brand hover:text-brand"
            >
              💬 WhatsApp
            </a>
          </div>

          {/*
            Navegação: mapa dentro do app (rota pelas ruas só com serviço
            real configurado) e, como alternativa, Google Maps e Waze.
          */}
          {!jaEntregue && (
            <button
              type="button"
              onClick={() => setNavigating(true)}
              className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-brand px-3 text-[0.82rem] font-bold text-white hover:bg-brand-dark"
            >
              <Navigation size={16} aria-hidden="true" /> Ver rota no mapa
            </button>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a href={route.google} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-sm border-2 border-ink-200 bg-white px-3 text-center text-[0.74rem] font-bold text-ink-700 hover:border-brand hover:text-brand">
              Google Maps
            </a>
            <a href={route.waze} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-sm border-2 border-ink-200 bg-white px-3 text-center text-[0.74rem] font-bold text-ink-700 hover:border-brand hover:text-brand">
              Waze
            </a>
          </div>
        </div>

        {navigating && (
          <DriverNavigation
            orderId={order.id}
            address={destination.address}
            reference={order.notes}
            googleUrl={route.google}
            wazeUrl={route.waze}
            useLocation={useLocation}
            onClose={() => setNavigating(false)}
          />
        )}

        {order.deliveryLatitude != null && order.deliveryLongitude != null && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-brand-light px-3 py-2 text-[0.78rem] font-semibold text-brand" data-testid="exact-pin">
            <MapPin size={15} aria-hidden /> Ponto exato marcado pelo cliente no mapa
          </p>
        )}
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
              <CheckCircle2 className="inline-block" size={16} aria-hidden="true" /> Confirmar entrega
            </Button>
          </>
        ) : (
          <Button fullWidth disabled={disabled || awaitingRelease(order)} onClick={() => onStep(step)}>
            {awaitingRelease(order) ? 'Aguardando a loja liberar a retirada' : STEP_LABEL[step]}
          </Button>
        )}

        {!jaEntregue && ['IN_TRANSIT', 'ARRIVED'].includes(order.delivery?.status ?? '') && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <label className="field-label" htmlFor="failed-delivery-reason">Não foi possível entregar?</label>
            <Input id="failed-delivery-reason" maxLength={300} value={failureReason}
              onChange={(event) => setFailureReason(event.target.value)} placeholder="Informe o motivo da tentativa sem sucesso" />
            <Button variant="secondary" fullWidth className="mt-2" disabled={disabled || failureReason.trim().length < 5}
              onClick={() => onFailure(failureReason.trim())}>Registrar tentativa sem sucesso</Button>
          </div>
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

// ── DISPONIBILIDADE E LOCALIZAÇÃO ───────────────────────────────────────

function LocationSettingsCard() {
  const [enabled, setEnabled] = useDriverLocationPref();
  const [state, setState] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  async function toggle() {
    if (enabled) { setEnabled(false); setState('Localização desligada. As rotas passam a partir da loja.'); return; }
    setChecking(true); setState(null);
    const result = await requestDriverLocation();
    setChecking(false);
    if (result.ok) { setEnabled(true); setState('Localização ativada para navegação.'); }
    else setState(result.reason === 'denied' ? 'Permissão negada. Para usar, permita a localização para este site nas configurações do navegador ou do celular.' : 'Este aparelho ou navegador não forneceu a localização agora.');
  }
  return (
    <Card className="p-4" data-testid="driver-location-settings">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.86rem] font-bold text-ink-900">Usar minha localização para navegação</p>
          <p className="mt-1 text-[0.74rem] leading-relaxed text-ink-500">
            Mostra sua posição no mapa e calcula as rotas a partir de onde você está. A posição fica neste aparelho e é usada só para navegação: a loja não vê sua localização e ela não é gravada. Atualiza com o aplicativo aberto na tela.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Usar minha localização para navegação" disabled={checking} onClick={toggle} className={cn('relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60', enabled ? 'bg-brand' : 'bg-ink-300')}>
          <span className={cn('inline-block h-6 w-6 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-7' : 'translate-x-1')} />
        </button>
      </div>
      {(state || checking) && <p className="mt-2.5 text-[0.76rem] font-semibold text-ink-700" role="status">{checking ? 'Pedindo permissão de localização…' : state}</p>}
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
