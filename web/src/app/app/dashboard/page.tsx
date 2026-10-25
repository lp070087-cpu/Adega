import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getDashboard } from '@/lib/data/dashboard';
import { getCashSummary } from '@/lib/data/cash';
import { getInventoryValue, getLowStockProducts } from '@/lib/data/inventory';
import { getDrivers, getDriverSummary } from '@/lib/data/drivers';
import { prisma } from '@/lib/db';
import { driverAvailability, isDriverOnline, DRIVER_AVAILABILITY_LABEL } from '@/lib/driver-availability';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { BarChart3, Boxes, ClipboardList, Image as ImageIcon, Truck, Wallet, Receipt } from 'lucide-react';
import { formatBRL, formatTime } from '@/lib/utils';
import { ORDER_SOURCE_LABEL } from '@/data/business-copy';
import { Alert, Badge, Card, CardHeader, EmptyState, AnimatedMoney } from '@/components/ui';
import { BreakdownBars, DonutChart, HourBars } from '@/components/charts/SimpleCharts';
import { TopProductsCard } from '@/components/dashboard/TopProductsCard';
import { LiveRefresh } from '@/components/layout/LiveRefresh';

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

const SHORTCUTS = [
  { href: '/app/pedidos', label: 'Pedidos', Icon: ClipboardList, tone: 'bg-[#e6f4fb] text-[#087EA4]' },
  { href: '/app/catalogo', label: 'Catálogo', Icon: Boxes, tone: 'bg-[#eef0ff] text-[#4f5bd5]' },
  { href: '/app/caixa', label: 'Caixa', Icon: Wallet, tone: 'bg-[#e8f8ef] text-[#159a5b]' },
  { href: '/app/entregadores', label: 'Entregadores', Icon: Truck, tone: 'bg-[#fff4e5] text-[#c27406]' },
  { href: '/app/banners', label: 'Banners', Icon: ImageIcon, tone: 'bg-[#fdeef4] text-[#c0306b]' },
  { href: '/app/relatorios', label: 'Relatórios', Icon: BarChart3, tone: 'bg-[#eaf1ff] text-[#2d6fd6]' },
];

/** Linha de tendência compacta (SVG puro), como no cartão de vendas da referência. */
function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const w = 280, h = 72, max = Math.max(...values, 1);
  const points = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * w : w / 2, h - 6 - (v / max) * (h - 14)]);
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" role="img" aria-label={`Vendas por dia: ${labels.map((l, i) => `${l} ${formatBRL(values[i])}`).join(', ')}`} preserveAspectRatio="none">
        <defs><linearGradient id="df-spark" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#087EA4" stopOpacity=".28" /><stop offset="100%" stopColor="#087EA4" stopOpacity="0" /></linearGradient></defs>
        <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#df-spark)" />
        <polyline points={line} fill="none" stroke="#087EA4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[0.64rem] text-ink-400">{labels.map((l, i) => <span key={i}>{l}</span>)}</figcaption>
    </figure>
  );
}

export default async function DashboardPage() {
  const { organizationId, role, user } = await requireOrgPage('VIEW_DASHBOARD');

  const [data, cash, inventory, lowStock, drivers, driverList, recentOrders, organization] = await Promise.all([
    getDashboard(organizationId),
    getCashSummary(organizationId),
    getInventoryValue(organizationId),
    getLowStockProducts(organizationId, 5),
    getDriverSummary(organizationId),
    getDrivers(organizationId, { active: true }),
    prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, displayId: true, customerName: true, total: true, status: true, source: true, deliveryType: true, createdAt: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ]);

  const withoutCatalog = data.today.orders === 0 && inventory.productCount === 0;
  const weekTotal = data.week.reduce((acc, day) => acc + day.revenue, 0);
  const firstName = user.name.split(' ')[0];
  const onlineDrivers = driverList.filter((d) => d.active && isDriverOnline(d));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.3rem] font-extrabold text-ink-900">Olá, {organization?.name ?? firstName}! 👋</h2>
          <p className="text-[0.84rem] text-ink-500">Aqui está o resumo da sua loja hoje · atualizado às {formatTime(data.generatedAt)}</p>
        </div>
        <LiveRefresh url="/api/app/pedidos/versao" />
      </div>

      {withoutCatalog && (
        <Alert tone="info" title="Sua loja ainda está vazia">
          Cadastre produtos no <Link href="/app/catalogo">Catálogo</Link> — ou aplique o
          catálogo-modelo do seu segmento em um clique — e comece a receber pedidos pela{' '}
          <Link href="/app/minha-loja">sua loja pública</Link>.
        </Alert>
      )}

      {/* ── Destaques do dia ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr] [&>*]:min-w-0" data-testid="dashboard-highlights">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1F3A] via-[#0d2a4f] to-[#0a4f6e] p-5 text-white shadow-[0_18px_40px_-20px_rgba(11,31,58,.8)] sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#168FE5]/25 blur-2xl" />
          <p className="text-[0.8rem] font-medium text-white/70">Faturamento hoje</p>
          <p className="mt-1 text-[2rem] font-extrabold leading-tight tracking-tight sm:text-[2.2rem]"><AnimatedMoney value={data.today.revenue} /></p>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
            <div><p className="text-[0.72rem] text-white/60">Pedidos hoje</p><p className="text-[1.05rem] font-bold">{data.today.orders}</p></div>
            <div><p className="text-[0.72rem] text-white/60">Ticket médio</p><p className="text-[1.05rem] font-bold"><AnimatedMoney value={data.today.averageTicket} /></p></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/app/pedidos" className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-[0.84rem] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(8,126,164,.9)] hover:bg-[#0a8fba]">Central de Pedidos</Link>
            <Link href="/app/catalogo" className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-4 text-[0.84rem] font-semibold text-white hover:bg-white/10">Catálogo</Link>
          </div>
        </section>

        <Card>
          <p className="text-[0.8rem] font-medium text-ink-500">Vendas dos últimos 7 dias</p>
          <p className="mt-1 text-[1.6rem] font-extrabold tracking-tight text-ink-900"><AnimatedMoney value={weekTotal} /></p>
          <p className="mt-2 text-[0.72rem] text-ink-500">Faturamento por dia, sem cancelados</p>
          <Sparkline values={data.week.map((day) => day.revenue)} labels={data.week.map((day) => day.label)} />
        </Card>

        <Card>
          <p className="text-[0.8rem] font-medium text-ink-500">Operação agora</p>
          <dl className="mt-3 divide-y divide-ink-100 text-[0.84rem]">
            <div className="flex items-center justify-between py-2.5"><dt className="text-ink-600">Pedidos em andamento</dt><dd className="font-bold text-ink-900">{data.today.openOrders}</dd></div>
            <div className="flex items-center justify-between py-2.5"><dt className="text-ink-600">Entregadores online</dt><dd className="font-bold text-ink-900">{onlineDrivers.length}</dd></div>
            <div className="flex items-center justify-between py-2.5"><dt className="text-ink-600">Entregas concluídas hoje</dt><dd className="font-bold text-ink-900">{drivers.dispatchesToday}</dd></div>
            <div className="flex items-center justify-between py-2.5"><dt className="text-ink-600">Caixa</dt><dd className={data.operations.hasOpenShift ? 'font-bold text-success' : 'font-bold text-ink-500'}>{data.operations.hasOpenShift ? 'Aberto' : 'Fechado'}</dd></div>
          </dl>
          <Link href="/app/pedidos" className="mt-2 inline-block text-[0.8rem] font-semibold text-brand hover:underline">Ver pedidos</Link>
        </Card>
      </div>

      {/* ── Atalhos ───────────────────────────────────────────────── */}
      <nav aria-label="Atalhos" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {SHORTCUTS.map(({ href, label, Icon, tone }) => (
          <Link key={href} href={href} className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-[#e8ebf1] bg-white px-2 py-4 text-center shadow-[0_1px_2px_rgba(16,24,40,.04)] transition-shadow hover:shadow-[0_8px_20px_-10px_rgba(16,24,40,.25)]">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon size={20} aria-hidden /></span>
            <span className="w-full truncate text-[0.78rem] font-semibold text-ink-700 group-hover:text-ink-900">{label}</span>
          </Link>
        ))}
      </nav>

      {/* ── Pedidos recentes e entregadores ───────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Pedidos recentes" action={<Link href="/app/pedidos" className="text-[0.8rem] font-semibold text-brand hover:underline">Ver todos</Link>} />
          {recentOrders.length === 0 ? (
            <EmptyState icon="🧾" title="Nenhum pedido ainda" description="Os pedidos aparecem aqui assim que entrarem." />
          ) : (
            <ul className="divide-y divide-ink-100" data-testid="recent-orders">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand"><Receipt size={18} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.84rem] font-semibold text-ink-900">#{order.displayId} · {order.customerName}</p>
                    <p className="truncate text-[0.72rem] text-ink-500">{ORDER_SOURCE_LABEL[order.source] ?? order.source} · {order.deliveryType === 'PICKUP' ? 'Retirada' : 'Entrega'}</p>
                  </div>
                  <span className="hidden sm:inline-flex"><StatusBadge status={order.status} deliveryType={order.deliveryType} /></span>
                  <div className="shrink-0 text-right">
                    <p className="text-[0.84rem] font-bold text-ink-900">{formatBRL(Number(order.total))}</p>
                    <p className="text-[0.7rem] text-ink-500">{formatTime(order.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader title="Entregadores" action={<Link href="/app/entregadores" className="text-[0.8rem] font-semibold text-brand hover:underline">Ver todos</Link>} />
          {driverList.filter((d) => d.active).length === 0 ? (
            <EmptyState icon="🛵" title="Nenhum entregador" description="Cadastre a equipe na aba Entregadores." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {driverList.filter((d) => d.active).slice(0, 5).map((driver) => {
                const state = driverAvailability(driver);
                return (
                  <li key={driver.id} className="flex items-center gap-3 py-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2f7] text-[0.75rem] font-extrabold text-ink-700" aria-hidden>{driver.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.84rem] font-semibold text-ink-900">{driver.name}</p>
                      <p className="flex items-center gap-1.5 text-[0.72rem] text-ink-500"><span className={`h-2 w-2 rounded-full ${state === 'AVAILABLE' ? 'bg-success' : state === 'BUSY' ? 'bg-warn' : 'bg-ink-300'}`} aria-hidden />{DRIVER_AVAILABILITY_LABEL[state]}{driver.activeOrders ? ` · ${driver.activeOrders} na rua` : ''}</p>
                    </div>
                    <span className="text-[0.72rem] text-ink-500">{driver.deliveredToday} hoje</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
          <TopProductsCard />
        </div>
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
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
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
                    <AnimatedMoney value={cash.openShift.totals.opening} />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.82rem] text-ink-500">Vendas no turno</span>
                  <span className="text-[0.82rem] font-semibold text-ink-800">
                    <AnimatedMoney value={cash.openShift.totals.totalSales} />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-ink-100 pt-2.5">
                  <span className="text-[0.84rem] font-bold text-ink-700">Em gaveta (esperado)</span>
                  <span className="text-[0.95rem] font-extrabold text-brand">
                    <AnimatedMoney value={cash.openShift.totals.expectedCash} />
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

