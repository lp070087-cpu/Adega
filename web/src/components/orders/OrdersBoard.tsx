'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { ORDER_SOURCE_LABEL } from '@/data/business-copy';
import { advanceOrderAction, assignFromCardAction, setOrderAutoAcceptAction, setPrepMinutesAction } from '@/app/actions/orders';
import { OrderCard, type KanbanOrder } from './OrderCard';
import { OrderDrawer, type DrawerOrder } from './OrderDrawer';
import { LiveRefresh } from '@/components/layout/LiveRefresh';
import { Alert, EmptyState, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge, SourceBadge, PaymentMethodBadge } from '@/components/ui/StatusBadge';
import { ManualOrderModal, type ManualProduct } from './ManualOrderModal';
import { isActiveOrder, orderBoardLane, orderRank } from '@/lib/order-flow';
import { cn } from '@/lib/utils';

/**
 * Quadro operacional atualizado quando chegam pedidos ou muda uma etapa.
 * Os cancelados ficam disponíveis em uma seção própria.
 */

/** Origens oferecidas no filtro. Pedidos antigos de outras origens (iFood,
 *  99Food, Zé Delivery, Manual) continuam visíveis em "Toda origem". */
const SOURCE_FILTERS = ['OWN_STORE', 'WHATSAPP', 'COUNTER'] as const;
type Section = 'all' | 'active' | 'done' | 'cancelled';

const BOARD_LANES = [
  { id: 'received', title: 'Pedidos recebidos', detail: 'Novos e aguardando envio', tone: 'border-red-300 bg-red-50', dot: 'bg-red-600' },
  { id: 'preparing', title: 'Em separação e rota', detail: 'Separação, retirada e entrega em andamento', tone: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
  { id: 'done', title: 'Entregues', detail: 'Entregas e retiradas concluídas', tone: 'border-emerald-300 bg-emerald-50', dot: 'bg-emerald-600' },
] as const;

export function OrdersBoard({
  products,
  orders,
  drivers,
  canManageOrders,
  canManageDrivers,
  canManageSettings = false,
  autoAccept = false,
  prepMinutes = 10,
  deliveryMinutes = 30,
  fiscal = null,
  initialOrderId = null,
}: {
  /** Pedido aberto ao chegar por uma notificação (`?pedido=<id>`). */
  initialOrderId?: string | null;
  fiscal?: { environment: 'homologacao' | 'producao' } | null;
  products: ManualProduct[];
  orders: DrawerOrder[];
  drivers: Array<{ id: string; name: string; status: string; activeOrders?: number; accessPending?: boolean }>;
  canManageOrders: boolean;
  canManageDrivers: boolean;
  canManageSettings?: boolean;
  autoAccept?: boolean;
  prepMinutes?: number;
  deliveryMinutes?: number;
}) {
  const [prepDraft, setPrepDraft] = useState(String(prepMinutes));
  const router = useRouter();
  const [view, setView] = useState<'cards' | 'tabela'>('cards');
  const [section, setSection] = useState<Section>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DrawerOrder | null>(() => (initialOrderId ? orders.find((order) => order.id === initialOrderId) ?? null : null));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoPending, startAuto] = useTransition();
  const [, startTransition] = useTransition();

  const isBoard = view === 'cards' && section !== 'cancelled';
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders
      .filter((order) => {
        const lane = orderBoardLane(order.status);
        if (section === 'cancelled' ? lane !== 'cancelled' : lane === 'cancelled') return false;
        if (section === 'done' && lane !== 'done') return false;
        if (section === 'active' && lane === 'done') return false;
        if (sourceFilter && order.source !== sourceFilter) return false;
        if (term && !`${order.displayId} ${order.customerName} ${order.customerPhone}`.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => orderRank(a.status) - orderRank(b.status) ||
        (isActiveOrder(a.status)
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.deliveredAt ?? b.cancelledAt ?? b.createdAt).getTime() - new Date(a.deliveredAt ?? a.cancelledAt ?? a.createdAt).getTime()));
  }, [orders, section, sourceFilter, search]);

  function run(order: KanbanOrder, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setPendingId(order.id);
    startTransition(async () => {
      let result: { ok: boolean; error?: string };
      try { result = await action(); } catch { result = { ok: false, error: 'Sem conexão. Tente novamente.' }; }
      setPendingId(null);
      if (!result.ok) setError(result.error ?? 'Não foi possível concluir.');
      router.refresh();
    });
  }
  const advance = (order: KanbanOrder) => run(order, () => advanceOrderAction({ orderId: order.id, from: order.status }));
  const assign = (order: KanbanOrder, driverId: string) => run(order, () => assignFromCardAction({ orderId: order.id, driverId }));
  function toggleAuto() {
    setError(null);
    startAuto(async () => {
      const result = await setOrderAutoAcceptAction(!autoAccept);
      if (!result.ok) setError(result.error ?? 'Não foi possível alterar.');
      router.refresh();
    });
  }

  const columns: Array<Column<DrawerOrder>> = [
    {
      key: 'id',
      header: 'Pedido',
      render: (order) => (
        <span className="font-extrabold text-ink-900">#{order.displayId}</span>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente',
      render: (order) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-800">{order.customerName}</p>
          <p className="truncate text-[0.72rem] text-ink-500">{order.customerPhone}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <StatusBadge status={order.status} deliveryType={order.deliveryType} />,
    },
    {
      key: 'origem',
      header: 'Origem',
      hideOnMobile: true,
      render: (order) => <SourceBadge source={order.source} />,
    },
    {
      key: 'pagamento',
      header: 'Pagamento',
      hideOnMobile: true,
      render: (order) => <PaymentMethodBadge method={order.paymentMethod} />,
    },
    {
      key: 'entregador',
      header: 'Entregador',
      hideOnMobile: true,
      render: (order) =>
        order.driver ? (
          <span className="text-[0.8rem] text-ink-600">{order.driver.name}</span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (order) => (
        <span className="font-bold text-brand">{formatBRL(order.total)}</span>
      ),
    },
  ];

  const counts = useMemo(() => ({
    active: orders.filter((o) => isActiveOrder(o.status)).length,
    done: orders.filter((o) => o.status === 'DELIVERED').length,
    cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    revenue: orders.filter((o) => isActiveOrder(o.status)).reduce((acc, o) => acc + o.total, 0),
  }), [orders]);

  const tabs: Array<[Section, string, number]> = view === 'cards'
    ? [['all', 'Quadro de pedidos', counts.active + counts.done], ['cancelled', 'Cancelados', counts.cancelled]]
    : [['all', 'Todos', counts.active + counts.done], ['active', 'Em andamento', counts.active], ['done', 'Finalizados', counts.done], ['cancelled', 'Cancelados', counts.cancelled]];

  const renderCard = (order: DrawerOrder) => (
    <OrderCard key={order.id} order={order} drivers={drivers} pending={pendingId === order.id} canManageOrders={canManageOrders} canManageDrivers={canManageDrivers} onOpen={() => setSelected(order)} onAdvance={advance} onAssign={assign} prepMinutes={prepMinutes} deliveryMinutes={deliveryMinutes} />
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <LiveRefresh url="/api/app/pedidos/versao" />
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn('flex min-h-11 items-center gap-2.5 rounded-lg border px-3', autoAccept ? 'border-success/40 bg-success-bg' : 'border-ink-200 bg-white')} data-testid="auto-accept">
            <span className="text-[0.78rem] font-semibold text-ink-800">{autoAccept ? 'Aceitação automática ativa' : 'Aceitar pedidos automaticamente'}</span>
            {canManageSettings ? (
              <button type="button" role="switch" aria-checked={autoAccept} aria-label="Aceitar pedidos automaticamente" disabled={autoPending} onClick={toggleAuto} className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60', autoAccept ? 'bg-success' : 'bg-ink-300')}>
                <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', autoAccept ? 'translate-x-6' : 'translate-x-1')} />
              </button>
            ) : <span className="text-[0.74rem] font-bold text-ink-500">{autoAccept ? 'Ligada' : 'Desligada'}</span>}
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-[0.78rem] font-semibold text-ink-800" data-testid="prep-minutes">
            Separação
            <input type="number" min={1} max={180} value={prepDraft} disabled={!canManageSettings} onChange={(e) => setPrepDraft(e.target.value)} onBlur={() => { const n = Number(prepDraft); if (n !== prepMinutes) startAuto(async () => { const r = await setPrepMinutesAction(n); if (!r.ok) { setError(r.error ?? 'Não foi possível salvar.'); setPrepDraft(String(prepMinutes)); } router.refresh(); }); }} aria-label="Tempo de separação em minutos" className="h-8 w-14 rounded-md border border-ink-200 px-2 text-center tabular-nums" />
            min
          </label>
          {canManageOrders && <ManualOrderModal products={products} onCreated={() => router.refresh()} />}
        </div>
      </div>
      {autoAccept && <p className="mb-3 text-[0.74rem] text-ink-500">Novos pedidos válidos da loja própria entram como Aceito. Pagamentos não são confirmados automaticamente; pedidos com pagamento online aguardam aceite manual.</p>}
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      <div className="mb-3 flex w-fit flex-wrap gap-1 rounded-lg bg-ink-100 p-1" role="tablist" aria-label="Seções de pedidos">
        {tabs.map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => setSection(key)} className={cn('min-h-11 rounded-md px-3 text-[0.78rem] font-bold transition-colors', section === key ? 'bg-white text-brand shadow-xs' : 'text-ink-600 hover:text-ink-900')}>
            {label} <span className="ml-1 rounded-full bg-ink-100 px-1.5 py-0.5 text-[0.68rem] text-ink-700">{count}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-ink-100 bg-white p-3">
        <div className="flex rounded-sm border-2 border-ink-200 p-0.5">
          {(['cards', 'tabela'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => { setView(mode); if (mode === 'cards' && section !== 'cancelled') setSection('all'); }} aria-pressed={view === mode} className={view === mode ? 'rounded-sm bg-brand px-3.5 py-1.5 text-[0.78rem] font-bold text-white' : 'rounded-sm px-3.5 py-1.5 text-[0.78rem] font-semibold text-ink-600 hover:text-brand'}>
              {mode === 'cards' ? 'Cartões' : 'Tabela'}
            </button>
          ))}
        </div>
        <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="w-auto min-w-[150px]" aria-label="Filtrar por origem">
          <option value="">Toda origem</option>
          {SOURCE_FILTERS.map((value) => <option key={value} value={value}>{ORDER_SOURCE_LABEL[value]}</option>)}
        </Select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nº, cliente ou telefone..." aria-label="Buscar pedido" className="field-input w-full basis-full sm:w-auto sm:min-w-[220px] sm:flex-1 sm:basis-auto" />
        <span className="ml-auto whitespace-nowrap text-[0.76rem] text-ink-500">{counts.active} em andamento · {formatBRL(counts.revenue)}</span>
      </div>

      {isBoard ? (
        <div className="grid divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 md:grid-cols-3 md:divide-x md:divide-y-0" data-testid="order-cards">
          {BOARD_LANES.map((lane) => {
            const laneOrders = filtered.filter((order) => orderBoardLane(order.status) === lane.id);
            return (
              <section key={lane.id} className="min-w-0 p-3" aria-labelledby={`orders-${lane.id}`} data-lane={lane.id}>
                <header className={cn('mb-3 rounded-xl border px-3 py-2.5', lane.tone)}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 id={`orders-${lane.id}`} className="flex items-center gap-2 text-sm font-extrabold text-ink-900"><span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', lane.dot)} />{lane.title}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-ink-800">{laneOrders.length}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-700">{lane.detail}</p>
                </header>
                <div className="space-y-3">
                  {laneOrders.length ? laneOrders.map(renderCard) : <p className="rounded-xl border border-dashed border-ink-200 bg-white px-3 py-5 text-center text-xs text-ink-600">Nenhum pedido nesta etapa.</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : view === 'cards' ? (
        filtered.length
          ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="order-cards">{filtered.map(renderCard)}</div>
          : <div className="rounded-lg border border-ink-100 bg-white"><EmptyState icon="🧭" title="Nenhum pedido cancelado" description="Os pedidos cancelados aparecem aqui." /></div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          keyOf={(order) => order.id}
          onRowClick={(order) => setSelected(order)}
          empty={{ icon: '🧭', title: 'Nenhum pedido neste filtro', description: 'Ajuste os filtros acima para ver outros pedidos.' }}
          footer={<p className="text-[0.74rem] text-ink-500">{filtered.length} pedido{filtered.length === 1 ? '' : 's'} · clique na linha para abrir</p>}
        />
      )}

      <OrderDrawer
        order={orders.find((order) => order.id === selected?.id) ?? null}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        drivers={drivers}
        canManageOrders={canManageOrders}
        canManageDrivers={canManageDrivers}
        canManageSettings={canManageSettings}
        onChanged={() => router.refresh()}
        fiscal={fiscal}
      />
    </>
  );
}
