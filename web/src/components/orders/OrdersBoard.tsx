'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { ORDER_STATUS_LABEL, ORDER_SOURCE_LABEL } from '@/data/business-copy';
import { updateOrderStatusAction } from '@/app/actions/orders';
import { OrderKanban, type KanbanOrder } from './OrderKanban';
import { OrderDrawer, type DrawerOrder } from './OrderDrawer';
import { Alert, Button, EmptyState, Select } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusBadge, SourceBadge, PaymentMethodBadge } from '@/components/ui/StatusBadge';
import type { OrderStatus } from '@prisma/client';

/**
 * Central de Pedidos: kanban para a operação, tabela para consulta.
 *
 * As duas visões leem o MESMO conjunto de pedidos que o servidor mandou —
 * a troca de visão é só apresentação, não dispara nova consulta e não
 * muda o que o usuário pode ver.
 */

export function OrdersBoard({
  orders,
  drivers,
  canManageOrders,
  canManageDrivers,
}: {
  orders: DrawerOrder[];
  drivers: Array<{ id: string; name: string; status: string }>;
  canManageOrders: boolean;
  canManageDrivers: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<'kanban' | 'tabela'>('kanban');
  const [statusFilter, setStatusFilter] = useState<string>('abertos');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DrawerOrder | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter === 'abertos' && ['DELIVERED', 'CANCELLED'].includes(order.status)) return false;
      if (statusFilter === 'fechados' && !['DELIVERED', 'CANCELLED'].includes(order.status)) return false;
      if (statusFilter !== 'abertos' && statusFilter !== 'fechados' && order.status !== statusFilter)
        return false;
      if (sourceFilter && order.source !== sourceFilter) return false;
      if (term) {
        const haystack = `${order.displayId} ${order.customerName} ${order.customerPhone}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, sourceFilter, search]);

  function advance(order: KanbanOrder, status: OrderStatus) {
    setError(null);
    setPendingId(order.id);
    startTransition(async () => {
      const result = await updateOrderStatusAction({ orderId: order.id, status });
      setPendingId(null);
      if (!result.ok) setError(result.error);
      else router.refresh();
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
      render: (order) => <StatusBadge status={order.status} />,
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

  const counters = useMemo(() => {
    const abertos = orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status));
    return {
      abertos: abertos.length,
      novos: orders.filter((o) => o.status === 'NEW').length,
      faturamento: abertos.reduce((acc, o) => acc + o.total, 0),
      entregues: orders.filter((o) => o.status === 'DELIVERED').length,
    };
  }, [orders]);

  return (
    <>
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-ink-100 bg-white p-3.5">
        <div className="flex rounded-sm border-2 border-ink-200 p-0.5">
          {(['kanban', 'tabela'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={
                view === mode
                  ? 'rounded-sm bg-brand px-3.5 py-1.5 text-[0.78rem] font-bold text-white'
                  : 'rounded-sm px-3.5 py-1.5 text-[0.78rem] font-semibold text-ink-600 hover:text-brand'
              }
            >
              {mode === 'kanban' ? 'Quadro' : 'Tabela'}
            </button>
          ))}
        </div>

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto min-w-[170px]"
          aria-label="Filtrar por status"
        >
          <option value="abertos">Em andamento</option>
          <option value="fechados">Finalizados</option>
          <option value="">Todos os status</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-auto min-w-[150px]"
          aria-label="Filtrar por origem"
        >
          <option value="">Toda origem</option>
          {Object.entries(ORDER_SOURCE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº, cliente ou telefone..."
          className="field-input min-w-[220px] flex-1"
        />

        <span className="ml-auto whitespace-nowrap text-[0.76rem] text-ink-500">
          {counters.abertos} em andamento · {formatBRL(counters.faturamento)}
        </span>
      </div>

      {view === 'kanban' ? (
        filtered.length === 0 ? (
          <div className="rounded-lg border border-ink-100 bg-white">
            <EmptyState
              icon="🧭"
              title="Nenhum pedido neste filtro"
              description="Quando um pedido entrar pela loja, ele aparece aqui automaticamente."
            />
          </div>
        ) : (
          <OrderKanban
            orders={filtered}
            onOpen={(order) => setSelected(filtered.find((o) => o.id === order.id) ?? null)}
            onAdvance={advance}
            pendingId={pendingId}
            canAdvance={canManageOrders}
          />
        )
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          keyOf={(order) => order.id}
          onRowClick={(order) => setSelected(order)}
          empty={{
            icon: '🧭',
            title: 'Nenhum pedido neste filtro',
            description: 'Ajuste os filtros acima para ver outros pedidos.',
          }}
          footer={
            <p className="text-[0.74rem] text-ink-500">
              {filtered.length} pedido{filtered.length === 1 ? '' : 's'} · clique na linha para abrir
            </p>
          }
        />
      )}

      <OrderDrawer
        order={selected}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        drivers={drivers}
        canManageOrders={canManageOrders}
        canManageDrivers={canManageDrivers}
        onChanged={() => router.refresh()}
      />

      {canManageOrders && filtered.length > 0 && (
        <p className="mt-3 text-[0.72rem] text-ink-400">
          Dica: no quadro, os botões avançam o pedido para o próximo status. Transições inválidas são
          recusadas pelo servidor.
        </p>
      )}

      {filtered.length > 0 && view === 'kanban' && (
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
            Atualizar
          </Button>
        </div>
      )}
    </>
  );
}
