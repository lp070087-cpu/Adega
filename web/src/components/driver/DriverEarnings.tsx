'use client';

import { useState, useTransition } from 'react';
import { loadOwnDriverEarnings, loadStoreDriverEarnings, saveDriverPayRule } from '@/app/actions/driver-earnings';
import type { EarningsSummary } from '@/lib/data/driver-earnings';
import type { DriverPayRule, EarningsDateRange, EarningsPeriod } from '@/lib/driver-earnings';
import { Alert } from '@/components/ui';
import { formatBRL, normalizeSearchText } from '@/lib/utils';

const PERIODS: Array<[EarningsPeriod, string]> = [['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês']];
const DRIVER_PERIODS: Array<[EarningsPeriod, string]> = [['all', 'Tudo'], ['week', 'Semana'], ['month', 'Mês'], ['custom', 'Por datas']];
const cents = (value: number) => formatBRL(value / 100);

/**
 * Ganhos por entrega, no app do entregador e na aba Entregadores da loja. Os
 * valores vêm sempre do servidor; a tela nunca soma pedidos.
 */
export function DriverEarnings({ initial, store = false, rule = null, drivers = [], preview = false }: { preview?: boolean; initial: EarningsSummary; store?: boolean; rule?: DriverPayRule | null; drivers?: Array<{ id: string; name: string }> }) {
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<EarningsPeriod>(store ? 'today' : 'all');
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [driverId, setDriverId] = useState('');
  const [showRange, setShowRange] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState<EarningsDateRange>();
  const filtered = drivers.filter((driver) => normalizeSearchText(driver.name).includes(normalizeSearchText(query)));

  function choose(value: EarningsPeriod, selected = driverId, dates = range, page = 1) {
    start(async () => {
      try {
        setData(await (store ? loadStoreDriverEarnings(value, selected) : loadOwnDriverEarnings(value, value === 'custom' ? dates : undefined, page)));
        setDriverId(selected);
        setPeriod(value);
        if (value === 'custom') setRange(dates);
        setError('');
      } catch {
        setError('Não foi possível atualizar. Confira sua conexão e tente novamente.');
      }
    });
  }

  if (preview) {
    return (
      <section className="space-y-4 rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="font-bold text-ink-900">Meus ganhos</h2>
        <p className="text-sm text-ink-600">Entre com o login de um entregador cadastrado para consultar o extrato.</p>
        <div className="grid grid-cols-2 gap-2"><Stat label="Nesta semana" value="—" /><Stat label="Neste mês" value="—" /></div>
        <EarningsChart chart={{ label: 'Gráfico de ganhos', points: [] }} />
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-ink-100 bg-white p-4" data-testid="driver-earnings">
      <div>
        <h2 className="font-bold text-ink-900">{store ? 'Financeiro dos entregadores' : 'Meus ganhos'}</h2>
        <p className="text-[0.8rem] text-ink-500">{store ? 'Consulte os valores calculados a partir das entregas concluídas.' : 'Somente o que você recebe pelas entregas concluídas, conforme a regra definida pela loja.'}</p>
      </div>

      {store && <div className="space-y-2">
        <label className="grid gap-1 text-sm font-medium">
          Buscar entregador pelo nome
          <input type="search" className="field-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite o nome do entregador" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} aria-pressed={!driverId} onClick={() => { setQuery(''); choose(period, ''); }} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium aria-pressed:border-brand aria-pressed:text-brand">Todos</button>
          {query.trim() && filtered.map((driver) => <button key={driver.id} type="button" disabled={pending} aria-pressed={driverId === driver.id} onClick={() => { setQuery(driver.name); choose(period, driver.id); }} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium aria-pressed:border-brand aria-pressed:text-brand">{driver.name}</button>)}
        </div>
        {query.trim() && !filtered.length && <p className="text-sm text-ink-500">Nenhum entregador com esse nome.</p>}
        {driverId && <p className="text-sm text-ink-600">Exibindo {drivers.find((driver) => driver.id === driverId)?.name}.</p>}
      </div>}

      {!store && data.overview && <div className="grid grid-cols-2 gap-2">
        <Stat label="Nesta semana" value={cents(data.overview.weekCents)} />
        <Stat label="Neste mês" value={cents(data.overview.monthCents)} />
      </div>}

      <div className={`grid gap-1 rounded-lg bg-ink-100 p-1 ${store ? 'grid-cols-3' : 'grid-cols-4'}`} role="group" aria-label="Período">
        {(store ? PERIODS : DRIVER_PERIODS).map(([key, label]) => (
          <button key={key} type="button" disabled={pending} aria-pressed={showRange ? key === 'custom' : period === key}
            onClick={() => { setShowRange(key === 'custom'); if (key !== 'custom') choose(key); }}
            className="min-h-11 rounded-md px-1 text-xs font-bold text-ink-600 aria-pressed:bg-white aria-pressed:text-brand">{label}</button>
        ))}
      </div>

      {showRange && <form className="grid grid-cols-2 gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (from && to && from <= to) choose('custom', driverId, { from, to });
      }}>
        <label className="grid min-w-0 gap-1 text-xs font-semibold">De<input required aria-label="Data inicial" className="field-input w-full" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold">Até<input required aria-label="Data final" className="field-input w-full" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
        <button disabled={pending} className="col-span-2 min-h-11 rounded-lg bg-brand text-sm font-bold text-white">Aplicar período</button>
      </form>}
      {period === 'custom' && range && <p className="text-xs text-ink-500">Resultados de {localDay(range.from)} até {localDay(range.to)}.</p>}

      <div aria-busy={pending} className={`grid gap-3 ${store ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <Stat label={store ? 'Total devido' : 'Total do período'} value={cents(data.amountCents)} testId="earnings-total" />
        <Stat label="Entregas concluídas" value={String(data.count)} testId="earnings-count" />
        {data.store && <Stat label="Taxas cobradas" value={formatBRL(data.store.deliveryFee)} />}
        {data.store && <Stat label="Faturamento dos pedidos" value={formatBRL(data.store.revenue)} />}
      </div>

      {!store && data.chart && <EarningsChart chart={data.chart} />}

      {!data.configured && <Alert tone="warn">{store ? 'O valor devido aparece quando a loja define a regra de repasse por entrega. As entregas concluídas e as taxas já são contabilizadas.' : 'A loja ainda não definiu o valor por entrega.'}</Alert>}
      {data.unpricedCount > 0 && <p className="text-[0.76rem] text-ink-500">{data.unpricedCount === 1 ? '1 entrega concluída' : `${data.unpricedCount} entregas concluídas`} sem remuneração definida na época. Nenhum valor foi estimado.</p>}

      {data.drivers && data.drivers.length > 0 && (
        <div className="overflow-x-auto" data-testid="earnings-by-driver">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Entregador</th>
                <th className="py-2 pr-3 text-right">Entregas</th>
                <th className="py-2 pr-3 text-right">Taxas cobradas</th>
                <th className="py-2 pr-3 text-right">Faturamento</th>
                <th className="py-2 text-right">Devido</th>
              </tr>
            </thead>
            <tbody>
              {data.drivers.map((driver) => (
                <tr key={driver.driverId} className="border-b border-ink-100 last:border-b-0">
                  <td className="max-w-[12rem] truncate py-2.5 pr-3 font-semibold text-ink-900">{driver.name}</td>
                  <td className="py-2.5 pr-3 text-right">{driver.deliveries}</td>
                  <td className="py-2.5 pr-3 text-right text-ink-600">{formatBRL(driver.deliveryFee)}</td>
                  <td className="py-2.5 pr-3 text-right text-ink-600">{formatBRL(driver.revenue)}</td>
                  <td className="py-2.5 text-right font-bold text-ink-900">{cents(driver.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="divide-y divide-ink-100" data-testid="earnings-rows">
        {data.rows.map((row) => (
          <li key={row.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span className="min-w-0 break-words">
              <span className="font-semibold text-ink-900">Pedido #{row.displayId}</span>{store ? ` · ${row.driverName}` : ''}
              <span className="block text-[0.74rem] text-ink-500">{new Date(row.completedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{row.deliveryFee !== undefined ? ` · taxa ${formatBRL(row.deliveryFee)} · pedido ${formatBRL(row.orderTotal ?? 0)}` : ''}</span>
            </span>
            {row.amountCents === null ? <span className="text-[0.78rem] text-ink-500">Sem valor definido</span> : <strong className="text-ink-900">{cents(row.amountCents)}</strong>}
          </li>
        ))}
      </ul>
      {data.rows.length === 0 && <p className="text-sm text-ink-500">Nenhuma entrega concluída neste período.</p>}
      {store && data.count > data.rows.length && <p className="text-[0.74rem] text-ink-500">Exibindo as {data.rows.length} entregas mais recentes. Os totais incluem todo o período.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {!store && data.pageSize && data.count > data.pageSize ? (
        <nav aria-label="Páginas do extrato" className="flex items-center justify-between gap-2 text-sm">
          <button type="button" className="min-h-11 rounded-lg border px-2 disabled:opacity-40" disabled={pending || (data.page ?? 1) <= 1} onClick={() => choose(period, driverId, range, (data.page ?? 1) - 1)}>Anterior</button>
          <span>{data.page ?? 1} de {Math.ceil(data.count / data.pageSize)}</span>
          <button type="button" className="min-h-11 rounded-lg border px-2 disabled:opacity-40" disabled={pending || (data.page ?? 1) * data.pageSize >= data.count} onClick={() => choose(period, driverId, range, (data.page ?? 1) + 1)}>Próxima</button>
        </nav>
      ) : null}

      {store && <details className="rounded-lg border border-ink-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Regra de repasse por entrega</summary>
        <PayRuleForm rule={rule} onSaved={() => choose(period)} />
      </details>}
    </section>
  );
}

function localDay(day: string) {
  return day.split('-').reverse().join('/');
}

function EarningsChart({ chart }: { chart: NonNullable<EarningsSummary['chart']> }) {
  const max = Math.max(1, ...chart.points.map(({ amountCents }) => amountCents));
  return <figure className="space-y-3 rounded-xl border border-ink-100 bg-ink-50 p-3">
    <figcaption className="text-sm font-bold text-ink-900">{chart.label}</figcaption>
    {chart.points.length ? <ul className="space-y-1.5">
      {chart.points.map(({ day, amountCents }) => <li key={day} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 text-xs text-ink-700">
        <time dateTime={day}>{localDay(day).slice(0, 5)}</time>
        <span className="h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${amountCents / max * 100}%` }} /></span>
        <strong className="text-right tabular-nums">{cents(amountCents)}</strong>
      </li>)}
    </ul> : <p className="text-sm text-ink-500">Nenhum valor registrado neste período.</p>}
  </figure>;
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-ink-50 p-3">
      <p className="text-[0.72rem] text-ink-500">{label}</p>
      <p className="break-words text-lg font-extrabold text-ink-900" data-testid={testId}>{value}</p>
    </div>
  );
}

function PayRuleForm({ rule, onSaved }: { rule: DriverPayRule | null; onSaved: () => void }) {
  const [mode, setMode] = useState<DriverPayRule['mode']>(rule?.mode ?? 'FIXED');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const money = rule?.mode === 'FIXED' ? (rule.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '';
  return (
    <form
      className="space-y-3 border-t border-ink-100 pt-4"
      data-testid="pay-rule-form"
      action={(form) => start(async () => {
        setResult(null);
        const saved = await saveDriverPayRule(form).catch(() => ({ ok: false, error: 'Sem resposta do servidor. Tente novamente.' }));
        setResult({ ok: saved.ok, text: saved.ok ? 'Regra salva. Vale para as próximas entregas concluídas.' : saved.error ?? 'Não foi possível salvar.' });
        if (saved.ok) onSaved();
      })}
    >
      <p className="text-sm font-semibold text-ink-900">Remuneração por entrega</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="field-label">Como calcular</span>
          <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as DriverPayRule['mode'])} className="field-input">
            <option value="FIXED">Valor fixo por entrega</option>
            <option value="FEE_PERCENT">Percentual da taxa de entrega</option>
          </select>
        </label>
        {mode === 'FIXED' ? (
          <label><span className="field-label">Valor por entrega (R$)</span><input name="amount" required inputMode="decimal" defaultValue={money} placeholder="0,00" className="field-input" /></label>
        ) : (
          <label><span className="field-label">Percentual da taxa (%)</span><input name="percent" required inputMode="decimal" defaultValue={rule?.mode === 'FEE_PERCENT' ? String(rule.percent).replace('.', ',') : '100'} className="field-input" /></label>
        )}
      </div>
      <p className="text-[0.76rem] text-ink-500">A alteração não recalcula entregas antigas. O frete cobrado do cliente continua vindo das regras de entrega.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar remuneração'}</button>
        {result && <p role="status" className={`text-[0.8rem] ${result.ok ? 'text-success' : 'text-danger'}`}>{result.text}</p>}
      </div>
    </form>
  );
}
