'use client';

import { Bike, Car, Footprints, MapPin, Navigation, Menu, ScanLine, Package, Map as MapIcon, Wallet, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/ui/BrandMark';
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
import { Alert, Badge, Button, Card, Drawer, EmptyState, Input } from '@/components/ui';
import { DriverInstallCard } from '@/components/driver/DriverInstall';
import { DriverScheduleNotice } from '@/components/driver/DriverScheduleNotice';
import { DriverRoutes } from '@/components/driver/DriverRoutes';
import { DriverEarnings } from '@/components/driver/DriverEarnings';
import { DeliveryPickupDialog } from '@/components/driver/DeliveryPickupDialog';
import { SlideToFinish } from '@/components/driver/SlideToFinish';
import { acceptDriverDelivery, collectDriverBatch, collectDriverDelivery } from '@/app/actions/delivery-pickup';
import { DriverAccount, type DriverAccountDetails } from '@/components/driver/DriverAccount';
import type { EarningsSummary } from '@/lib/data/driver-earnings';
import { useLiveRefresh } from '@/components/layout/LiveRefresh';
import { requestDriverLocation, useDriverLocationPref } from '@/lib/driver-location-pref';
import { DRIVER_IN_PROGRESS_STATUSES, DRIVER_START_BLOCKED, nextDriverStep, type DriverStep } from '@/lib/validations/driver-flow';

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

type Step = DriverStep;

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
  changeFor: number | null;
  deliveryZipCode: string | null;
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
    accepted: boolean;
    requiresPickupCode: boolean;
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

/** Atribuído durante o aceite ou a separação: a loja ainda precisa liberar a retirada. */
const awaitingRelease = (order: { status: string }) => order.status === 'CONFIRMED' || order.status === 'PREPARING';

const isInProgress = (order: DriverOrder) => DRIVER_IN_PROGRESS_STATUSES.some(status => order.delivery?.status === status);

function canCollectWithoutCode(order: DriverOrder) {
  return order.status === 'WAITING_DRIVER' && order.delivery?.status === 'ASSIGNED' && !order.delivery.requiresPickupCode;
}

function deliveryActionLabel(order: DriverOrder, step: Step) {
  if (step === 'PICKED_UP' && order.delivery?.status === 'ASSIGNED' && !order.delivery.accepted) return 'Aceitar entrega';
  if (awaitingRelease(order)) return 'Aguardando liberação da loja';
  if (step === 'PICKED_UP' && order.delivery?.requiresPickupCode) return 'Escanear coleta';
  return STEP_LABEL[step];
}

const STEP_LABEL: Record<Step, string> = {
  ARRIVED_STORE: 'Cheguei na loja',
  PICKED_UP: 'Confirmar retirada',
  STARTED: 'Iniciar entrega',
  ARRIVED_CUSTOMER: 'Cheguei no cliente',
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
  account,
  store,
  orders,
  earnings,
  preview = false,
}: {
  driver: DriverIdentity;
  account: DriverAccountDetails;
  store: DriverStore;
  orders: DriverOrder[];
  earnings: EarningsSummary;
  preview?: boolean;
}) {
  const router = useRouter();
  useLiveRefresh(preview ? null : '/api/entregador/versao', 8000);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'entregas' | 'mapa' | 'ganhos' | 'perfil'>('entregas');
  const [selectedPickups, setSelectedPickups] = useState<string[]>([]);
  const [pickupMode, setPickupMode] = useState<'camera' | 'manual' | null>(null);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [menuOpen]);
  const [navTarget, setNavTarget] = useState<string | null>(null);
  const clearNavigationTarget = useCallback(() => setNavTarget(null), []);
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
  const routeOrders = useMemo(() => active.map((order) => ({
    ...order,
    stepLabel: order.delivery ? DELIVERY_STATUS_LABEL[order.delivery.status] ?? 'Atribuída' : 'Atribuída',
  })), [active]);

  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;
  const inProgressOrders = active.filter(isInProgress);
  const startBlocked = (order: DriverOrder) => nextDriverStep(order.delivery) === 'STARTED' && inProgressOrders.some(current => current.id !== order.id);


  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    if (preview) return;
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
    if (!preview && driver.status === 'OFFLINE') void setMyDriverStatusAction('ONLINE').then(() => router.refresh()).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function selectSection(section: typeof tab) {
    setTab(section);
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }

  function openOrderMap(orderId: string) {
    setOpenId(null);
    setNavTarget(orderId);
    selectSection('mapa');
  }

  function openPickup(mode: 'camera' | 'manual') {
    setOpenId(null);
    setPickupError(null);
    setPickupMode(mode);
  }

  function collect(code: string) {
    setPickupError(null);
    if (preview) { setPickupError('Entre com a conta de um entregador cadastrado para registrar uma coleta.'); return; }
    startTransition(async () => {
      try {
        const result = await collectDriverDelivery(code);
        if (!result.ok) { setPickupError(result.error); return; }
        setPickupMode(null);
        setNotice(`Retirada do pedido #${result.order.displayId} confirmada.`);
        router.refresh();
      } catch {
        setPickupError('Não foi possível validar o código. Confira sua conexão e tente novamente.');
      }
    });
  }

  const availablePickups = active.filter(canCollectWithoutCode);
  const selectedForPickup = availablePickups.filter(order => selectedPickups.includes(order.id)).map(order => order.id);

  function collectSelected(ids: string[]) {
    run(() => collectDriverBatch(ids), () => {
      setSelectedPickups(idsSelected => idsSelected.filter(id => !ids.includes(id)));
      setNotice(ids.length === 1 ? 'Retirada confirmada.' : `${ids.length} retiradas confirmadas.`);
    });
  }

  function advance(order: DriverOrder, step: Step, notes?: string) {
    if (step === 'STARTED' && startBlocked(order)) return;
    if (step === 'PICKED_UP' && order.delivery?.status === 'ASSIGNED' && !order.delivery.accepted) {
      run(() => acceptDriverDelivery(order.id), () => setNotice(`Entrega #${order.displayId} aceita.`));
      return;
    }
    if (step === 'PICKED_UP' && order.delivery?.requiresPickupCode) { openPickup('camera'); return; }
    if (step === 'PICKED_UP' && canCollectWithoutCode(order)) { collectSelected([order.id]); return; }
    run(() => driverStepAction({ orderId: order.id, step, notes }), () => {
      if (step === 'ARRIVED_CUSTOMER') setNotice('Chegada registrada no acompanhamento do cliente.');
      else if (step === 'DELIVERED') setNotice(`Entrega do pedido #${order.displayId} confirmada.`);
      else setNotice(`Entrega #${order.displayId} em andamento.`);
      if (step === 'DELIVERED') setOpenId(null);
      if (step === 'STARTED') setOpenId(order.id);
    });
  }

  const renderOrder = (order: DriverOrder) => (
    <OrderCard
      key={order.id}
      order={order}
      now={now}
      disabled={pending || preview}
      startBlocked={startBlocked(order)}
      onOpen={() => setOpenId(order.id)}
      selected={selectedPickups.includes(order.id)}
      onSelect={() => setSelectedPickups(ids => ids.includes(order.id) ? ids.filter(id => id !== order.id) : [...ids, order.id])}
      onStep={(step, notes) => advance(order, step, notes)}
    />
  );

  const tabs = [
    ['entregas', 'Entregas', Package, active.length],
    ['mapa', 'Mapa', MapIcon, 0],
    ['ganhos', 'Ganhos', Wallet, 0],
    ['perfil', 'Minha conta', UserRound, 0],
  ] as const;

  return (
    <div className="panel-shell flex min-h-screen bg-ink-50">
      <aside className="panel-sidebar sticky top-0 order-last hidden h-screen w-[260px] shrink-0 flex-col p-4 lg:flex">
        <div className="px-2 py-2"><BrandMark tone="light" /></div>
        <p className="mb-4 mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white">{store.name}</p>
        <nav aria-label="Seções do entregador" className="space-y-1">
          {tabs.map(([key, label, Icon, count]) => <button key={key} type="button" onClick={() => selectSection(key)} aria-current={tab === key ? 'page' : undefined}
            className={cn('flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold', tab === key ? 'bg-brand text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}>
            <Icon size={19} aria-hidden />{label}{count > 0 && <span className="ml-auto rounded-full bg-white/20 px-2">{count}</span>}
          </button>)}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="sticky top-0 z-20">
        {/* ── CABEÇALHO ────────────────────────────────────────────── */}
        <header
          className="panel-header border-b border-ink-100 bg-white px-4 pb-3 text-ink-900 shadow-sm lg:px-7"
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
                {preview ? 'Visão do proprietário' : availability}
                <span className="text-ink-300">•</span>
                <span className="truncate">{store.name}</span>
              </p>
            </div>

            <span className="hidden flex-shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-[0.74rem] font-bold text-ink-700 sm:inline-flex">
              <VehicleIcon type={driver.vehicleType} /> {driver.vehiclePlate ?? '—'}
            </span>
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu do entregador" aria-haspopup="dialog" aria-expanded={menuOpen} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-ink-200 px-2.5 text-sm font-semibold text-ink-800 lg:hidden">
              <Menu size={20} aria-hidden /> Menu
            </button>
          </div>
        </header>

      </div>

      <main className="panel-content mx-auto w-full max-w-6xl flex-1 space-y-5 px-3 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5 lg:px-7 lg:pt-6">
        {preview && <Alert tone="neutral" title="Visualização do motoboy">
          Nesta demonstração você pode testar o mapa e conferir as telas. O extrato e a edição dos dados ficam disponíveis para o entregador cadastrado. <Link href="/admin" className="font-semibold underline">Voltar ao Admin Central</Link>
        </Alert>}
        {!online && <Alert tone="warn">Sem conexão. As entregas exibidas podem estar desatualizadas. Reconecte para registrar alterações.</Alert>}
        {error && (
          <Alert tone="danger" title="Não foi possível concluir">
            {error}
          </Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}

        {tab === 'mapa' && <DriverRoutes
          orders={routeOrders}
          storeOrigin={store.latitude != null && store.longitude != null ? { latitude: store.latitude, longitude: store.longitude } : null}
          preview={preview}
          onOpenOrder={setOpenId}
          autoNavigate={navTarget}
          onAutoNavigate={clearNavigationTarget}
        />}

        {/* ── MINHAS ENTREGAS ──────────────────────────────────────── */}
        {tab === 'entregas' && (
          <>
            {!preview && <DriverScheduleNotice />}
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div><h1 className="text-lg font-extrabold text-ink-900">Minhas entregas</h1><p className="text-sm text-ink-500">{active.length ? `${active.length} em aberto` : 'Nenhuma entrega em aberto'}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => openPickup('camera')}><ScanLine size={17} aria-hidden /> Escanear código</Button>
                <Button size="sm" variant="secondary" onClick={() => openPickup('manual')}>Digitar código</Button>
              </div>
            </Card>
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
              <>
                {availablePickups.length > 0 && <Card className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="font-bold text-ink-900">Retiradas liberadas</h2><p className="text-sm text-ink-600">Marque os pedidos que você está levando.</p></div>
                    {availablePickups.length > 1 && <Button size="sm" variant="secondary" onClick={() => setSelectedPickups(availablePickups.map(order => order.id))}>Selecionar todas</Button>}
                  </div>
                  {selectedForPickup.length > 0 && <SlideToFinish disabled={pending || preview} onFinish={() => collectSelected(selectedForPickup)} label={`Arraste para retirar ${selectedForPickup.length === 1 ? '1 entrega' : `${selectedForPickup.length} entregas`}`} confirmation="Confirmar a retirada dos pedidos selecionados?" />}
                </Card>}
                {active.map(renderOrder)}
              </>
            )}
          </>
        )}

        {/* ── GANHOS ───────────────────────────────────────────────── */}
        {tab === 'ganhos' && <DriverEarnings key={earnings.count} initial={earnings} preview={preview} />}

        {tab === 'perfil' && (
          <>
            <DriverAccount name={driver.name} vehicle={driver.vehicleType} plate={driver.vehiclePlate} store={store.name} account={account} preview={preview} />
            <LocationSettingsCard onOpenMap={() => selectSection('mapa')} />

            {!preview && <DriverInstallCard />}
            <Alert tone="neutral" title="Sobre este app">
              A loja vê se você está online e o andamento das entregas, nunca a sua localização.
              Mantenha a conexão para registrar alterações.
            </Alert>

            {!preview && <button
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
            </button>}
          </>
        )}
      </main>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu do entregador" panelClassName="w-[86vw] max-w-xs lg:hidden">
        <nav aria-label="Seções do entregador" className="space-y-2">
          {tabs.map(([key, label, Icon, count]) => (
            <button key={key} type="button" aria-current={tab === key ? 'page' : undefined}
              onClick={() => selectSection(key)}
              className={cn('flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold', tab === key ? 'bg-brand-light text-brand' : 'text-ink-700 hover:bg-ink-50')}>
              <Icon size={20} aria-hidden />{label}
              {count > 0 && <span className="ml-auto rounded-full bg-ink-100 px-2">{count}</span>}
            </button>
          ))}
        </nav>
      </Drawer>

      {/* ── DETALHE DA ENTREGA ─────────────────────────────────────── */}
      {pickupMode && <DeliveryPickupDialog cameraFirst={pickupMode === 'camera'} pending={pending} error={pickupError} onClose={() => setPickupMode(null)} onCollect={collect} />}
      {openOrder && (
        <OrderSheet
          order={openOrder}
          store={store}
          disabled={pending || preview}
          startBlocked={startBlocked(openOrder)}
          onClose={() => setOpenId(null)}
          onOpenMap={() => openOrderMap(openOrder.id)}
          onFailure={(reason) => run(
            () => reportFailedDeliveryAction({ orderId: openOrder.id, reason }),
            () => { setNotice('Tentativa registrada. A loja recebeu o pedido para novo despacho.'); setOpenId(null); },
          )}
          onStep={(step, notes) => advance(openOrder, step, notes)}
        />
      )}
      </div>
    </div>
  );
}

// ── CARTÃO DE ENTREGA ────────────────────────────────────────────────────

function OrderCard({
  order,
  now,
  disabled,
  startBlocked,
  onOpen,
  selected,
  onSelect,
  onStep,
}: {
  order: DriverOrder;
  now: number;
  disabled: boolean;
  startBlocked: boolean;
  onOpen: () => void;
  selected: boolean;
  onSelect: () => void;
  onStep: (step: Step, notes?: string) => void;
}) {
  const step = nextDriverStep(order.delivery);
  const isDelivery = order.status === 'DELIVERED';
  const waitingStore = awaitingRelease(order);
  const inRoute = isInProgress(order);
  const cobrar = order.paymentStatus === 'PENDING' && order.paymentMethod !== 'ONLINE' ? order.total : null;

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
          <Badge tone={isDelivery ? 'green' : inRoute ? 'blue' : waitingStore ? 'neutral' : late ? 'yellow' : 'orange'}>
            {isDelivery
              ? 'Finalizado'
              : order.delivery?.status === 'ARRIVED' ? 'Chegou no cliente'
              : inRoute ? 'Em rota'
              : order.delivery?.status === 'PICKED_UP' ? 'Retirado · pronto para sair'
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
          {(order.deliveryDistrict || order.deliveryCity) && <p className="text-[0.76rem] text-ink-600">{[order.deliveryDistrict, order.deliveryCity, order.deliveryZipCode].filter(Boolean).join(' · ')}</p>}
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

      <p className="mt-2 text-sm text-ink-700">Taxa de entrega <strong>{formatBRL(order.deliveryFee)}</strong></p>
      <div className="mt-3 space-y-2">
        {canCollectWithoutCode(order) && <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selected} onChange={onSelect} className="h-5 w-5 accent-brand" /> Selecionar pedido #{order.displayId} para retirada</label>}
        <Button variant={step === 'ARRIVED_CUSTOMER' ? 'primary' : 'secondary'} onClick={onOpen} fullWidth>{step === 'ARRIVED_CUSTOMER' ? 'Entrega em andamento' : 'Ver detalhes'}</Button>
        {step === 'DELIVERED' ? <SlideToFinish disabled={disabled} onFinish={() => onStep(step)} label="Arraste para finalizar a corrida" /> : step === 'PICKED_UP' && canCollectWithoutCode(order) && order.delivery?.accepted ? <SlideToFinish disabled={disabled} onFinish={() => onStep(step)} label="Arraste para retirar" confirmation="Confirmar a retirada deste pedido?" /> : step && step !== 'ARRIVED_CUSTOMER' && (
          <Button fullWidth disabled={disabled || startBlocked || (waitingStore && order.delivery?.accepted)} onClick={() => onStep(step)}>
            {deliveryActionLabel(order, step)}
          </Button>
        )}
        {startBlocked && <p className="text-xs font-medium text-ink-600">{DRIVER_START_BLOCKED}</p>}
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
  startBlocked,
  onClose,
  onOpenMap,
  onStep,
  onFailure,
}: {
  order: DriverOrder;
  store: DriverStore;
  disabled: boolean;
  startBlocked: boolean;
  onClose: () => void;
  onOpenMap: () => void;
  onStep: (step: Step, notes?: string) => void;
  onFailure: (reason: string) => void;
}) {
  const step = nextDriverStep(order.delivery);
  const [receiver, setReceiver] = useState('');
  const [failureReason, setFailureReason] = useState('');
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
              onClick={onOpenMap}
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

        <dl className="mb-4 space-y-2 rounded-lg bg-ink-50 px-3.5 py-3 text-sm text-ink-800">
          <div className="flex justify-between gap-2 font-extrabold"><dt>{order.paymentStatus === 'PENDING' && order.paymentMethod !== 'ONLINE' ? 'Total a cobrar' : 'Total do pedido'}</dt><dd>{formatBRL(order.total)}</dd></div>
          <div className="flex justify-between gap-2"><dt>Pagamento</dt><dd>{PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}{order.paymentStatus === 'PAID' ? ' · Pago' : ''}</dd></div>
          {order.paymentMethod === 'CASH' && order.paymentStatus === 'PENDING' && order.changeFor != null && <>
            <div className="flex justify-between gap-2"><dt>Troco para</dt><dd>{formatBRL(order.changeFor)}</dd></div>
            <div className="flex justify-between gap-2"><dt>Troco do cliente</dt><dd>{formatBRL(Math.max(0, order.changeFor - order.total))}</dd></div>
          </>}
        </dl>

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
            <SlideToFinish disabled={disabled} onFinish={() => onStep('DELIVERED', receiver.trim() || undefined)} label="Arraste para finalizar a corrida" />
          </>
        ) : step === 'PICKED_UP' && canCollectWithoutCode(order) && order.delivery?.accepted ? (
          <SlideToFinish disabled={disabled} onFinish={() => onStep(step)} label="Arraste para retirar" confirmation="Confirmar a retirada deste pedido?" />
        ) : step === 'ARRIVED_CUSTOMER' ? (
          <SlideToFinish disabled={disabled} onFinish={() => onStep(step)} label="Cheguei no cliente" confirmation="Confirmar sua chegada e avisar o cliente?" />
        ) : step && (
          <Button fullWidth disabled={disabled || startBlocked || (awaitingRelease(order) && order.delivery?.accepted)} onClick={() => onStep(step)}>
            {deliveryActionLabel(order, step)}
          </Button>
        )}
        {startBlocked && <p className="mt-2 text-xs font-medium text-ink-600">{DRIVER_START_BLOCKED}</p>}

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

function LocationSettingsCard({ onOpenMap }: { onOpenMap: () => void }) {
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
          <p className="text-[0.86rem] font-bold text-ink-900">Localização em tempo real</p>
          <p className="mt-1 text-[0.74rem] leading-relaxed text-ink-500">
            Autorize o GPS do celular para ver sua posição enquanto a aba Mapa estiver aberta. Sua posição é usada para navegação e fica fora do painel da loja.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Usar minha localização para navegação" disabled={checking} onClick={toggle} className={cn('relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60', enabled ? 'bg-brand' : 'bg-ink-300')}>
          <span className={cn('inline-block h-6 w-6 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-7' : 'translate-x-1')} />
        </button>
      </div>
      {enabled && <Button size="sm" variant="secondary" onClick={onOpenMap} className="mt-3">Ver minha posição no mapa</Button>}
      {(state || checking) && <p className="mt-2.5 text-[0.76rem] font-semibold text-ink-700" role="status">{checking ? 'Pedindo permissão de localização…' : state}</p>}
    </Card>
  );
}
