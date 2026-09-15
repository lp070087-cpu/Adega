import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getDashboard } from '@/lib/data/dashboard';
import { getCashSummary } from '@/lib/data/cash';
import { getInventoryValue, getLowStockProducts } from '@/lib/data/inventory';
import { getDriverSummary } from '@/lib/data/drivers';
import { formatBRL, formatTime } from '@/lib/utils';
import { ORDER_SOURCE_LABEL } from '@/data/business-copy';
import { Alert, Badge, Card, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { BreakdownBars, DonutChart, HourBars, LineChart } from '@/components/charts/SimpleCharts';

export const metadata = { title: 'Visão Geral' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * VISÃO GERAL
 * -----------------------------------------------------------------------
 * Todos os números vêm de agregações do banco (getDashboard). A página é
 * um Server Component: o navegador recebe o HTML já calculado, e não há
 * um único total sendo somado no cliente.
 * ═══════════════════════════════════════════════════════════════════════
 */

const SOURCE_COLORS: Record<string, string> = {
  OWN_STORE: '#F15A24',
  IFOOD: '#EA1D2C',
  FOOD99: '#FFCC00',
  ZE_DELIVERY: '#7C3AED',
  WHATSAPP: '#10B981',
  COUNTER: '#3B82F6',
  MANUAL: '#999999',
};

export default async function DashboardPage() {
  const { organizationId, role, user } = await requireOrgPage('VIEW_DASHBOARD');

  const [data, cash, inventory, lowStock, drivers] = await Promise.all([
    getDashboard(organizationId),
    getCashSummary(organizationId),
    getInventoryValue(organizationId),
    getLowStockProducts(organizationId, 5),
    getDriverSummary(organizationId),
  ]);

  const withoutCatalog = data.today.orders === 0 && inventory.productCount === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.15rem] font-extrabold text-ink-900">
            Olá, {user.name.split(' ')[0]}
          </h2>
          <p className="text-[0.82rem] text-ink-500">
            Resumo de hoje · atualizado às {formatTime(data.generatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/app/pedidos"
            className="rounded-sm bg-brand px-4 py-2.5 text-[0.84rem] font-semibold text-white transition-all hover:bg-brand-dark"
          >
            Central de Pedidos
          </Link>
          <Link
            href="/app/catalogo"
            className="rounded-sm border-2 border-ink-200 bg-white px-4 py-2.5 text-[0.84rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
          >
            Catálogo
          </Link>
        </div>
      </div>

      {withoutCatalog && (
        <Alert tone="info" title="Sua loja ainda está vazia">
          Cadastre produtos no <Link href="/app/catalogo">Catálogo</Link> — ou aplique o
          catálogo-modelo do seu segmento em um clique — e comece a receber pedidos pela{' '}
          <Link href="/app/minha-loja">sua loja pública</Link>.
        </Alert>
      )}

      {/* ── Indicadores do dia ────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="💰"
          label="Faturamento hoje"
          value={formatBRL(data.today.revenue)}
          hint={`${data.today.orders} pedido${data.today.orders === 1 ? '' : 's'} válido${
            data.today.orders === 1 ? '' : 's'
          }`}
          tone="orange"
        />
        <StatCard
          icon="🧭"
          label="Em andamento"
          value={String(data.today.openOrders)}
          hint={
            data.today.cancelled > 0
              ? `${data.today.cancelled} cancelado${data.today.cancelled === 1 ? '' : 's'} hoje`
              : 'Nenhum cancelamento hoje'
          }
          tone="blue"
        />
        <StatCard
          icon="🎯"
          label="Ticket médio"
          value={formatBRL(data.today.averageTicket)}
          hint={`Entrega: ${data.today.delivered} concluída${data.today.delivered === 1 ? '' : 's'}`}
          tone="purple"
        />
        <StatCard
          icon="🛵"
          label="Entregadores ativos"
          value={String(data.operations.driversOnline)}
          hint={`${drivers.dispatchesToday} entrega${drivers.dispatchesToday === 1 ? '' : 's'} hoje`}
          tone="teal"
        />
      </div>

      {/* ── Alertas operacionais ──────────────────────────────────── */}
      {(data.operations.lowStockCount > 0 || !data.operations.hasOpenShift) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.operations.lowStockCount > 0 && (
            <Alert tone="warn" title={`${data.operations.lowStockCount} produto(s) no estoque mínimo`}>
              <Link href="/app/estoque">Abrir Estoque</Link> para repor.
            </Alert>
          )}
          {!data.operations.hasOpenShift && (
            <Alert tone="info" title="Nenhum caixa aberto">
              As vendas não estão sendo lançadas em um turno.{' '}
              <Link href="/app/caixa">Abrir o caixa</Link>.
            </Alert>
          )}
        </div>
      )}

      {/* ── Gráficos ──────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Vendas dos últimos 7 dias"
            subtitle="Faturamento por dia, sem pedidos cancelados"
          />
          <LineChart
            data={data.week.map((day) => ({ label: day.label, value: day.revenue }))}
            format="currency"
          />
        </Card>

        <Card>
          <CardHeader title="Origem dos pedidos" subtitle="Participação de hoje" />
          <DonutChart
            slices={data.bySource.map((entry) => ({
              label: ORDER_SOURCE_LABEL[entry.source] ?? entry.source,
              value: entry.orders,
              color: SOURCE_COLORS[entry.source] ?? '#999999',
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Pedidos por horário" subtitle="Hoje" />
          <HourBars data={data.byHour} format="currency" />
        </Card>

        <Card>
          <CardHeader title="Tempos operacionais" subtitle="Médias das entregas de hoje" />
          {data.times.sampleSize === 0 ? (
            <EmptyState
              icon="⏱️"
              title="Sem entregas concluídas hoje"
              description="As médias de preparo e entrega aparecem assim que o primeiro pedido do dia for entregue."
            />
          ) : (
            <div className="space-y-3">
              <TimeRow
                label="Preparo"
                value={data.times.averagePrep}
                hint="Do aceite até ficar pronto"
              />
              <TimeRow
                label="Entrega"
                value={data.times.averageDelivery}
                hint="Da saída até a chegada ao cliente"
              />
              <TimeRow
                label="Total"
                value={data.times.averageTotal}
                hint="Do pedido até a entrega"
                highlight
              />
              <p className="pt-1 text-[0.72rem] text-ink-400">
                Base: {data.times.sampleSize} entrega{data.times.sampleSize === 1 ? '' : 's'}{' '}
                concluída{data.times.sampleSize === 1 ? '' : 's'} hoje.
              </p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Mais vendidos hoje"
            subtitle="Por quantidade"
            action={
              <Link href="/app/relatorios" className="text-[0.78rem] font-semibold text-brand hover:underline">
                Ver relatórios
              </Link>
            }
          />
          {data.topItems.length === 0 ? (
            <EmptyState
              icon="🏆"
              title="Nenhum item vendido hoje"
              description="O ranking aparece quando os primeiros pedidos do dia forem registrados."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {data.topItems.map((item, index) => (
                <li key={item.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className={
                      index < 3
                        ? 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white'
                        : 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.7rem] font-bold text-ink-500'
                    }
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.84rem] text-ink-700">
                    {item.name}
                  </span>
                  <Badge tone="neutral">{item.quantity} un.</Badge>
                  <span className="w-[86px] flex-shrink-0 text-right text-[0.84rem] font-bold text-ink-900">
                    {formatBRL(item.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Caixa" subtitle="Turno atual" />
            {cash.hasOpenShift && cash.openShift ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[0.82rem] text-ink-500">Aberto desde</span>
                  <span className="text-[0.82rem] font-semibold text-ink-800">
                    {formatTime(cash.openShift.openedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.82rem] text-ink-500">Abertura</span>
                  <span className="text-[0.82rem] font-semibold text-ink-800">
                    {formatBRL(cash.openShift.totals.opening)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.82rem] text-ink-500">Vendas no turno</span>
                  <span className="text-[0.82rem] font-semibold text-ink-800">
                    {formatBRL(cash.openShift.totals.totalSales)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-ink-100 pt-2.5">
                  <span className="text-[0.84rem] font-bold text-ink-700">Em gaveta (esperado)</span>
                  <span className="text-[0.95rem] font-extrabold text-brand">
                    {formatBRL(cash.openShift.totals.expectedCash)}
                  </span>
                </div>
                <Link
                  href="/app/caixa"
                  className="mt-1 block rounded-sm border-2 border-ink-200 py-2 text-center text-[0.78rem] font-semibold text-ink-600 transition-all hover:border-brand hover:text-brand"
                >
                  Abrir Caixa
                </Link>
              </div>
            ) : (
              <EmptyState
                icon="🧾"
                title="Caixa fechado"
                description="Abra um turno para acompanhar as vendas em dinheiro."
                action={
                  <Link
                    href="/app/caixa"
                    className="rounded-sm bg-brand px-4 py-2 text-[0.8rem] font-semibold text-white transition-all hover:bg-brand-dark"
                  >
                    Abrir caixa
                  </Link>
                }
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Estoque" subtitle="Situação atual" />
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[0.82rem]">
                <span className="text-ink-500">Itens controlados</span>
                <span className="font-semibold text-ink-800">{inventory.productCount}</span>
              </div>
              <div className="flex items-center justify-between text-[0.82rem]">
                <span className="text-ink-500">Unidades em estoque</span>
                <span className="font-semibold text-ink-800">{inventory.units}</span>
              </div>
              <div className="flex items-center justify-between text-[0.82rem]">
                <span className="text-ink-500">Valor de custo</span>
                <span className="font-semibold text-ink-800">{formatBRL(inventory.costValue)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-ink-100 pt-2.5 text-[0.82rem]">
                <span className="font-bold text-ink-700">Valor de venda</span>
                <span className="font-extrabold text-brand">{formatBRL(inventory.saleValue)}</span>
              </div>
            </div>

            {lowStock.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
                  Repor com urgência
                </p>
                <ul className="space-y-1.5">
                  {lowStock.map((product) => (
                    <li key={product.id} className="flex items-center gap-2 text-[0.8rem]">
                      <span aria-hidden>{product.emoji ?? '📦'}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-600">{product.name}</span>
                      <Badge tone={product.stock === 0 ? 'red' : 'yellow'}>
                        {product.stock} / {product.minimumStock}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/app/estoque"
                  className="mt-3 block text-[0.78rem] font-semibold text-brand hover:underline"
                >
                  Ver todo o estoque
                </Link>
              </>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Faturamento por origem"
          subtitle="Hoje · ticket médio por canal"
          action={<Badge tone="orange">{role === 'OWNER' ? 'Proprietário' : 'Operação'}</Badge>}
        />
        <BreakdownBars
          items={data.bySource.map((entry) => ({
            label: ORDER_SOURCE_LABEL[entry.source] ?? entry.source,
            value: entry.revenue,
            hint: `${entry.orders} pedido${entry.orders === 1 ? '' : 's'} · ticket ${formatBRL(
              entry.orders > 0 ? entry.revenue / entry.orders : 0,
            )}`,
          }))}
          emptyLabel="Nenhuma venda registrada hoje."
        />
      </Card>
    </div>
  );
}

function TimeRow({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded border-2 border-brand/25 bg-brand-light px-3.5 py-3'
          : 'rounded border border-ink-100 px-3.5 py-3'
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.82rem] font-semibold text-ink-700">{label}</span>
        <span
          className={
            highlight
              ? 'text-[1.1rem] font-extrabold text-brand'
              : 'text-[1.1rem] font-extrabold text-ink-900'
          }
        >
          {value} min
        </span>
      </div>
      <p className="mt-0.5 text-[0.72rem] text-ink-500">{hint}</p>
    </div>
  );
}

