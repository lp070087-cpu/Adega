import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getSalesReport, periodRange, type Period } from '@/lib/data/dashboard';
import { formatBRL, formatDateTime, formatNumber } from '@/lib/utils';
import { ORDER_SOURCE_LABEL, PAYMENT_METHOD_LABEL } from '@/data/business-copy';
import { Badge, Card, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { BreakdownBars, LineChart } from '@/components/charts/SimpleCharts';
import { PaymentStatusBadge, SourceBadge } from '@/components/ui/StatusBadge';

export const metadata = { title: 'Vendas' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * VENDAS
 * -----------------------------------------------------------------------
 * O relatório é montado no servidor (getSalesReport) e a página só
 * desenha. Nenhum total é somado no navegador — nem o do gráfico, nem o
 * das barras por forma de pagamento.
 *
 * O período viaja como querystring. Isso é conveniência de navegação, não
 * segurança: o que a consulta pode ver é decidido pelo organizationId da
 * sessão, não pelo que está na URL.
 * ═══════════════════════════════════════════════════════════════════════
 */

type PageProps = { searchParams: Promise<{ periodo?: string }> };

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

function toPeriod(value: string | undefined): Period {
  return PERIODS.some((p) => p.value === value) ? (value as Period) : 'today';
}

export default async function SalesPage({ searchParams }: PageProps) {
  const ctx = await requireOrgPage('VIEW_REPORTS');
  const { periodo } = await searchParams;
  const period = toPeriod(periodo);

  const report = await getSalesReport(ctx.organizationId, period);
  const { start, end } = periodRange(period);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-extrabold text-ink-900">Vendas</h2>
          <p className="text-[0.8rem] text-ink-500">
            {formatDateTime(start)} — {formatDateTime(end)} · pedidos cancelados fora da conta
          </p>
        </div>

        <nav className="flex gap-2" aria-label="Período">
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={`/app/vendas?periodo=${option.value}`}
              className={`rounded-full border-2 px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all ${
                period === option.value
                  ? 'border-brand bg-brand text-white'
                  : 'border-ink-200 text-ink-600 hover:border-brand hover:text-brand'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="💰"
          label="Faturamento"
          value={formatBRL(report.totals.revenue)}
          hint={`${formatNumber(report.totals.orders)} pedido${
            report.totals.orders === 1 ? '' : 's'
          } no período`}
          tone="orange"
        />
        <StatCard
          icon="🎯"
          label="Ticket médio"
          value={formatBRL(report.totals.averageTicket)}
          hint="Faturamento ÷ pedidos"
          tone="purple"
        />
        <StatCard
          icon="🛵"
          label="Taxas de entrega"
          value={formatBRL(report.totals.deliveryFees)}
          hint="Somadas ao cliente"
          tone="teal"
        />
        <StatCard
          icon="🏷️"
          label="Descontos"
          value={formatBRL(report.totals.discounts)}
          hint={`Subtotal ${formatBRL(report.totals.subtotal)}`}
          tone="blue"
        />
      </div>

      <Card>
        <CardHeader title="Faturamento por dia" subtitle="Sem pedidos cancelados" />
        {report.daily.length === 0 ? (
          <EmptyState
            icon="📈"
            title="Nenhuma venda no período"
            description="Escolha outro período ou aguarde os primeiros pedidos."
          />
        ) : (
          <LineChart
            data={report.daily.map((day) => ({
              label: day.date.slice(8) + '/' + day.date.slice(5, 7),
              value: day.revenue,
            }))}
            format="currency"
          />
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Por origem" subtitle="De onde vieram os pedidos" />
          <BreakdownBars
            items={report.bySource.map((entry) => ({
              label: ORDER_SOURCE_LABEL[entry.key] ?? entry.key,
              value: entry.revenue,
              hint: `${entry.orders} pedido${entry.orders === 1 ? '' : 's'}`,
            }))}
            emptyLabel="Sem vendas no período."
          />
        </Card>

        <Card>
          <CardHeader title="Por forma de pagamento" subtitle="Como o cliente pagou" />
          <BreakdownBars
            items={report.byPayment.map((entry) => ({
              label: PAYMENT_METHOD_LABEL[entry.key] ?? entry.key,
              value: entry.revenue,
              hint: `${entry.orders} pedido${entry.orders === 1 ? '' : 's'}`,
            }))}
            emptyLabel="Sem vendas no período."
          />
        </Card>

        <Card>
          <CardHeader title="Produtos mais vendidos" subtitle="Por faturamento" />
          {report.topProducts.length === 0 ? (
            <p className="py-6 text-center text-[0.8rem] text-ink-400">Sem itens vendidos.</p>
          ) : (
            <ul className="space-y-2.5">
              {report.topProducts.slice(0, 10).map((product, index) => (
                <li key={product.name} className="flex items-center gap-3">
                  <span
                    className={
                      index < 3
                        ? 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.7rem] font-bold text-white'
                        : 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.7rem] font-bold text-ink-500'
                    }
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] text-ink-700">
                    {product.name}
                  </span>
                  <Badge tone="neutral">{product.quantity} un.</Badge>
                  <span className="w-[84px] flex-shrink-0 text-right text-[0.82rem] font-bold text-ink-900">
                    {formatBRL(product.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pedidos do período"
          subtitle={`${report.orders.length} pedido${report.orders.length === 1 ? '' : 's'} — os 100 mais recentes aparecem na Central de Pedidos`}
          action={
            <Link href="/app/pedidos" className="text-[0.78rem] font-semibold text-brand hover:underline">
              Central de Pedidos
            </Link>
          }
        />
        {report.orders.length === 0 ? (
          <EmptyState
            icon="🧭"
            title="Nenhum pedido no período"
            description="Troque o período acima para ver outro intervalo."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-ink-100 text-left">
                  <Th>Pedido</Th>
                  <Th>Cliente</Th>
                  <Th>Origem</Th>
                  <Th>Pagamento</Th>
                  <Th className="text-right">Subtotal</Th>
                  <Th className="text-right">Entrega</Th>
                  <Th className="text-right">Desconto</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {report.orders.slice(0, 100).map((order) => (
                  <tr key={order.id} className="border-b border-ink-100 last:border-b-0">
                    <td className="py-2.5 pr-4">
                      <p className="text-[0.82rem] font-bold text-ink-800">#{order.displayId}</p>
                      <p className="text-[0.68rem] text-ink-400">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </td>
                    <td className="py-2.5 pr-4 text-[0.82rem] text-ink-600">{order.customerName}</td>
                    <td className="py-2.5 pr-4">
                      <SourceBadge source={order.source} />
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.76rem] text-ink-600">
                          {PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
                        </span>
                        <PaymentStatusBadge status={order.paymentStatus ?? 'PENDING'} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                      {formatBRL(order.subtotal)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                      {formatBRL(order.deliveryFee)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                      {order.discount > 0 ? `− ${formatBRL(order.discount)}` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-[0.84rem] font-bold text-ink-900">
                      {formatBRL(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {report.orders.length > 100 && (
              <p className="mt-3 text-[0.72rem] text-ink-400">
                Mostrando os 100 primeiros de {report.orders.length}. Os totais acima consideram
                todos.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500 ${
        className ?? ''
      }`}
    >
      {children}
    </th>
  );
}
