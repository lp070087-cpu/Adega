'use client';

import { useState, useTransition } from 'react';
import { loadOwnDriverEarnings, loadStoreDriverEarnings, saveDriverPayRule } from '@/app/actions/driver-earnings';
import type { EarningsSummary } from '@/lib/data/driver-earnings';
import type { DriverPayRule, EarningsPeriod } from '@/lib/driver-earnings';
import { Alert } from '@/components/ui';
import { formatBRL } from '@/lib/utils';

const PERIODS: Array<[EarningsPeriod, string]> = [['today', 'Hoje'], ['week', 'Semana'], ['month', 'Mês']];
const cents = (value: number) => formatBRL(value / 100);

/**
 * Ganhos por entrega, no app do entregador e na aba Entregadores da loja. Os
 * valores vêm sempre do servidor; a tela nunca soma pedidos.
 */
export function DriverEarnings({ initial, store = false, rule = null }: { initial: EarningsSummary; store?: boolean; rule?: DriverPayRule | null }) {
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  function choose(value: EarningsPeriod) {
    start(async () => {
      try {
        setData(await (store ? loadStoreDriverEarnings : loadOwnDriverEarnings)(value));
        setPeriod(value);
        setError('');
      } catch {
        setError('Não foi possível atualizar. Confira sua conexão e tente novamente.');
      }
    });
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-ink-100 bg-white p-4" data-testid="driver-earnings">
      <div>
        <h2 className="font-bold text-ink-900">{store ? 'Remuneração dos entregadores' : 'Meus ganhos'}</h2>
        <p className="text-[0.8rem] text-ink-500">{store ? 'Faturamento da loja, taxa cobrada do cliente e ganho do entregador são valores diferentes.' : 'Somente o que você recebe pelas entregas concluídas, conforme a regra definida pela loja.'}</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1" role="group" aria-label="Período">
        {PERIODS.map(([key, label]) => (
          <button key={key} type="button" disabled={pending} aria-pressed={period === key} onClick={() => choose(key)} className={`min-h-11 rounded-md text-sm font-bold ${period === key ? 'bg-white text-brand shadow-xs' : 'text-ink-600'}`}>{label}</button>
        ))}
      </div>

      <div aria-busy={pending} className={`grid gap-3 ${store ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
        <Stat label={store ? 'Total devido' : 'Ganhos'} value={cents(data.amountCents)} testId="earnings-total" />
        <Stat label="Entregas concluídas" value={String(data.count)} testId="earnings-count" />
        {data.store && <Stat label="Taxas cobradas" value={formatBRL(data.store.deliveryFee)} />}
        {data.store && <Stat label="Faturamento dos pedidos" value={formatBRL(data.store.revenue)} />}
      </div>

      {!data.configured && <Alert tone="warn">{store ? 'Defina abaixo a remuneração por entrega. Sem regra, as entregas concluídas não geram valor.' : 'A loja ainda não definiu o valor por entrega.'}</Alert>}
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
      {data.count > data.rows.length && <p className="text-[0.74rem] text-ink-500">Exibindo as {data.rows.length} entregas mais recentes. Os totais incluem todo o período.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {store && <PayRuleForm rule={rule} onSaved={() => choose(period)} />}
    </section>
  );
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
