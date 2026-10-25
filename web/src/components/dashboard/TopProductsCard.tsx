'use client';

import { useEffect, useState, useTransition } from 'react';
import { getTopProductsAction, type TopProductsResult } from '@/app/actions/dashboard';
import { formatBRL } from '@/lib/utils';

const COLORS = ['#087EA4', '#0B1F3A', '#3FA7D6', '#F2A541', '#6C8EBF', '#2E9E6B'];
const OTHERS = '#B8C2CC';
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Produtos mais vendidos (vendas concluídas) com filtro de período. */
export function TopProductsCard() {
  const [range, setRange] = useState<'today' | 'month' | 'custom'>('today');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<TopProductsResult | null>(null);
  const [pending, start] = useTransition();

  const load = (next = range) => start(async () => setData(await getTopProductsAction({ range: next, from, to }).catch(() => ({ ok: false as const, error: 'Não foi possível carregar agora.' }))));
  useEffect(() => { if (range !== 'custom') load(range); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const slices = data?.ok ? data.slices : [];
  const radius = 54, circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-[0_1px_2px_rgba(11,31,58,.04)] sm:p-5" data-testid="top-products">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[0.98rem] font-bold text-ink-900">Produtos mais vendidos</h2>
        <div className="flex rounded-full bg-ink-100 p-0.5 text-[0.74rem] font-semibold" role="tablist" aria-label="Período">
          {([['today', 'Hoje'], ['month', 'Este mês'], ['custom', 'Personalizado']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={range === key} onClick={() => setRange(key)} className={`min-h-9 rounded-full px-3 ${range === key ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>{label}</button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); load('custom'); }}>
          <label className="text-[0.74rem] text-ink-600">De<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="field-input mt-0.5 !min-h-10 !py-1.5" aria-label="Data inicial" /></label>
          <label className="text-[0.74rem] text-ink-600">Até<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field-input mt-0.5 !min-h-10 !py-1.5" aria-label="Data final" /></label>
          <button type="submit" className="min-h-10 rounded-lg bg-brand px-3.5 text-[0.8rem] font-bold text-white">Aplicar</button>
        </form>
      )}

      <div className={`mt-4 transition-opacity ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
        {!data ? <p className="py-8 text-center text-[0.8rem] text-ink-400">Carregando…</p>
          : !data.ok ? <p className="py-6 text-center text-[0.8rem] text-danger" role="alert">{data.error}</p>
          : data.total <= 0 ? <p className="py-8 text-center text-[0.8rem] text-ink-400">Nenhuma venda concluída no período.</p>
          : (
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start xl:flex-col xl:items-center 2xl:flex-row 2xl:items-start">
              <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`Participação dos produtos no total de ${formatBRL(data.total)}`}>
                <g transform="rotate(-90 70 70)">
                  {slices.map((s, i) => {
                    const dash = s.share * circ;
                    const el = <circle key={s.key} cx="70" cy="70" r={radius} fill="none" stroke={s.key === 'outros' ? OTHERS : COLORS[i % COLORS.length]} strokeWidth="20" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
                    offset += dash;
                    return el;
                  })}
                </g>
                <text x="70" y="64" textAnchor="middle" className="fill-[var(--gray-500)] text-[9px]">total</text>
                <text x="70" y="80" textAnchor="middle" className="fill-[var(--gray-900)] text-[13px] font-bold">{formatBRL(data.total)}</text>
              </svg>
              <ul className="w-full min-w-0 flex-1 space-y-2" data-testid="top-products-legend">
                {slices.map((s, i) => (
                  <li key={s.key} className="flex items-start gap-2 text-[0.8rem]">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.key === 'outros' ? OTHERS : COLORS[i % COLORS.length] }} aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-ink-900">{s.label}</span><span className="block text-[0.72rem] text-ink-500">{s.quantity} {s.quantity === 1 ? 'unidade' : 'unidades'} · {formatBRL(s.total)}</span></span>
                    <span className="shrink-0 font-bold tabular-nums text-ink-800">{pct(s.share)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-ink-100 pt-2 text-[0.76rem] text-ink-600"><span>{data.quantity} unidades em {data.orders} {data.orders === 1 ? 'pedido entregue' : 'pedidos entregues'}</span><strong className="text-ink-900">{formatBRL(data.total)}</strong></li>
              </ul>
            </div>
          )}
      </div>
    </section>
  );
}
