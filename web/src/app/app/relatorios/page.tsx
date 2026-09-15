import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getOperationsReport, periodRange, type Period } from '@/lib/data/dashboard';
import { formatBRL, formatDateTime } from '@/lib/utils';
import { VEHICLE_TYPE_LABEL } from '@/data/business-copy';
import { Badge, Card, CardHeader, EmptyState, StatCard } from '@/components/ui';
import { BreakdownBars } from '@/components/charts/SimpleCharts';

export const metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * RELATÓRIOS OPERACIONAIS
 * -----------------------------------------------------------------------
 * Responde "onde está travando?", não "quanto vendi?" — o quanto vendi
 * fica em Vendas. Aqui o assunto é tempo: preparo, espera por entregador,
 * entrega, e taxa de cancelamento.
 *
 * Todos os números vêm de getOperationsReport. Nada é calculado no
 * navegador, e nenhum pedido de outra loja entra na conta.
 * ═══════════════════════════════════════════════════════════════════════
 */

type PageProps = { searchParams: Promise<{ periodo?: string }> };

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
];

function toPeriod(value: string | undefined): Period {
  return PERIODS.some((p) => p.value === value) ? (value as Period) : '7d';
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const ctx = await requireOrgPage('VIEW_REPORTS');
  const { periodo } = await searchParams;
  const period = toPeriod(periodo);

  const report = await getOperationsReport(ctx.organizationId, period);
  const { start, end } = periodRange(period);

  // Sem pedido entregue no período, as médias de tempo são zero — e zero
  // minuto lido como "entrega instantânea" seria pior que dizer que não
  // há base. Por isso a tela separa "sem base" de "rápido".
  const hasTiming = report.totals.delivered > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-extrabold text-ink-900">Relatórios</h2>
          <p className="text-[0.8rem] text-ink-500">
            Operação de {formatDateTime(start)} a {formatDateTime(end)}
          </p>
        </div>

        <nav className="flex gap-2" aria-label="Período">
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={`/app/relatorios?periodo=${option.value}`}
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
          icon="🧭"
          label="Pedidos no período"
          value={String(report.totals.orders)}
          hint={`${report.totals.inProgress} ainda em andamento`}
          tone="blue"
        />
        <StatCard
          icon="✅"
          label="Entregues"
          value={String(report.totals.delivered)}
          hint="Concluídos com sucesso"
          tone="green"
        />
        <StatCard
          icon="⚠️"
          label="Cancelados"
          value={String(report.totals.cancelled)}
          hint={`${report.totals.cancelRate}% dos pedidos`}
          tone={report.totals.cancelRate > 10 ? 'red' : 'gray'}
        />
        <StatCard
          icon="⏱️"
          label="Tempo total médio"
          value={hasTiming ? `${report.times.averageTotal} min` : '—'}
          hint={hasTiming ? `Pior caso: ${report.times.maxTotal} min` : 'Sem entrega concluída'}
          tone="purple"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Onde o tempo vai"
            subtitle="Médias das entregas concluídas no período"
          />
          {!hasTiming ? (
            <EmptyState
              icon="⏱️"
              title="Sem entregas concluídas no período"
              description="As médias aparecem quando o primeiro pedido for entregue."
            />
          ) : (
            <div className="space-y-3">
              <Stage
                label="Preparo"
                value={report.times.averagePrep}
                hint="Do aceite até ficar pronto para sair"
              />
              <Stage
                label="Espera por entregador"
                value={report.times.averageDispatchWait}
                hint="Do pronto até alguém sair com o pedido"
              />
              <Stage
                label="Entrega"
                value={report.times.averageDelivery}
                hint="Da saída da loja até a chegada ao cliente"
              />
              <div className="border-t border-ink-100 pt-3">
                <Stage
                  label="Total do pedido"
                  value={report.times.averageTotal}
                  hint="Do pedido até a entrega"
                  highlight
                />
              </div>

              <p className="text-[0.72rem] text-ink-400">
                Base: {report.totals.delivered} entrega
                {report.totals.delivered === 1 ? '' : 's'} concluída
                {report.totals.delivered === 1 ? '' : 's'}. Uma espera por entregador alta costuma
                significar frota pequena para o volume do horário.
              </p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Entregas por entregador"
            subtitle="Ordenado por volume de entregas"
          />
          {report.drivers.length === 0 ? (
            <EmptyState
              icon="🛵"
              title="Nenhuma entrega atribuída"
              description="Quando houver entregas com entregador vinculado, o ranking aparece aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-100 text-left">
                    <th className="pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                      Entregador
                    </th>
                    <th className="pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                      Veículo
                    </th>
                    <th className="pb-2 pr-4 text-right text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                      Entregas
                    </th>
                    <th className="pb-2 pr-4 text-right text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                      Valor entregue
                    </th>
                    <th className="pb-2 text-right text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                      Taxas
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.drivers.map((driver) => (
                    <tr key={driver.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="py-2.5 pr-4 text-[0.84rem] font-semibold text-ink-800">
                        {driver.name}
                      </td>
                      <td className="py-2.5 pr-4 text-[0.78rem] text-ink-500">
                        {VEHICLE_TYPE_LABEL[driver.vehicleType] ?? driver.vehicleType}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Badge tone="blue">{driver.deliveries}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[0.82rem] text-ink-700">
                        {formatBRL(driver.orderValue)}
                      </td>
                      <td className="py-2.5 text-right text-[0.82rem] text-ink-700">
                        {formatBRL(driver.deliveryFees)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Repartição dos pedidos"
          subtitle="Quanto do volume chegou ao fim, quanto foi cancelado e quanto segue em andamento"
        />
        <BreakdownBars
          items={[
            { label: 'Entregues', value: report.totals.delivered, hint: 'Chegaram ao cliente' },
            { label: 'Cancelados', value: report.totals.cancelled, hint: 'Não geraram receita' },
            { label: 'Em andamento', value: report.totals.inProgress, hint: 'Ainda na operação' },
          ]}
          format="orders"
          emptyLabel="Sem pedidos no período."
        />
      </Card>
    </div>
  );
}

function Stage({
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
