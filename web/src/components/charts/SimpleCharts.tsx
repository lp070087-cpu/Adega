'use client';

import { useMemo, useState } from 'react';
import { cn, formatBRL } from '@/lib/utils';

/**
 * Gráficos em SVG puro — sem biblioteca.
 *
 * Motivo: o painel original (plataforma.html) desenhava o gráfico de
 * vendas à mão, com a animação de traço. Reproduzir isso com uma
 * dependência de charting custaria ~100 kB para o mesmo resultado. Aqui
 * o traçado é SVG com stroke-dasharray animado, exatamente como era.
 *
 * Os NÚMEROS vêm sempre prontos do servidor: estes componentes só dão
 * forma. Nada é recalculado no navegador.
 */

// ── GRÁFICO DE LINHA / ÁREA ────────────────────────────────────────────

/**
 * Como o número é apresentado.
 *
 * Por que uma CHAVE e não uma função: estes são client components, e o
 * React só permite atravessar a fronteira servidor -> cliente com dados
 * serializáveis. Uma função aqui derruba a página inteira com
 * "Functions cannot be passed directly to Client Components".
 *
 * Foi exatamente o que aconteceu quando Vendas e Relatórios viraram
 * server components: a prop deixou de ser serializável e a tela parou de
 * abrir. A regra passou a ser do próprio componente — quem chama manda
 * uma string, nunca código.
 */
export type ValueFormat = 'currency' | 'number' | 'orders';

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  currency: (value) => formatBRL(value),
  number: (value) => String(value),
  orders: (value) => `${value} pedido${value === 1 ? '' : 's'}`,
};

function formatValue(value: number, format: ValueFormat): string {
  return (FORMATTERS[format] ?? FORMATTERS.currency)(value);
}

export function LineChart({
  data,
  height = 200,
  format = 'currency',
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  format?: ValueFormat;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { points, path, area, max } = useMemo(() => {
    const width = 720;
    const padding = { top: 16, right: 12, bottom: 28, left: 12 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const values = data.map((d) => d.value);
    const maxValue = Math.max(1, ...values);
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;

    const pts = data.map((d, i) => ({
      x: padding.left + i * step,
      y: padding.top + innerH - (d.value / maxValue) * innerH,
      ...d,
    }));

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const closed = `${line} L ${pts[pts.length - 1]?.x ?? 0} ${padding.top + innerH} L ${
      pts[0]?.x ?? 0
    } ${padding.top + innerH} Z`;

    return { points: pts, path: line, area: closed, max: maxValue };
  }, [data, height]);

  if (data.length === 0) return null;

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-baseline gap-3">
        <p className="text-[1.4rem] font-extrabold leading-none text-ink-900">
          {formatValue(
            active ? active.value : data.reduce((acc, d) => acc + d.value, 0),
            format,
          )}
        </p>
        <p className="text-[0.74rem] text-ink-500">
          {active ? active.label : 'total do período'}
        </p>
        <p className="ml-auto text-[0.7rem] text-ink-400">
          pico {formatValue(max, format)}
        </p>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 720 ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Evolução do período"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="line-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--orange)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Linhas-guia */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1="12"
              x2="708"
              y1={16 + (height - 44) * ratio}
              y2={16 + (height - 44) * ratio}
              stroke="var(--gray-200)"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}

          <path d={area} fill="url(#line-grad)" />

          {/* stroke-dasharray animado: o mesmo "desenho" do painel antigo */}
          <path
            d={path}
            fill="none"
            stroke="var(--orange)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 2400,
              strokeDashoffset: 0,
              animation: 'draw-line 1.1s cubic-bezier(.25,.1,.25,1) both',
            }}
          />

          {points.map((point, index) => (
            <g key={`${point.label}-${index}`}>
              {/* Alvo invisível maior: facilita o hover no toque */}
              <rect
                x={point.x - 24}
                y={0}
                width={48}
                height={height}
                fill="transparent"
                onMouseEnter={() => setHover(index)}
                onTouchStart={() => setHover(index)}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={hover === index ? 5 : 3.5}
                fill="white"
                stroke="var(--orange)"
                strokeWidth="2.5"
                className="transition-all"
              />
            </g>
          ))}
        </svg>

        <div className="mt-1 flex justify-between px-2">
          {data.map((d, i) => (
            <span
              key={`${d.label}-label-${i}`}
              className={cn(
                'text-[0.66rem] transition-colors',
                hover === i ? 'font-bold text-brand' : 'text-ink-400',
              )}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── BARRAS POR HORA ────────────────────────────────────────────────────

export function HourBars({
  data,
  format = 'currency',
}: {
  data: Array<{ hour: number; orders: number; revenue: number }>;
  format?: ValueFormat;
}) {
  const max = Math.max(1, ...data.map((d) => d.orders));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div>
      <div className="flex h-[150px] items-end gap-[3px]">
        {data.map((entry) => {
          const height = entry.orders === 0 ? 2 : Math.max(6, (entry.orders / max) * 140);
          return (
            <div
              key={entry.hour}
              className="group relative flex flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(entry.hour)}
              onMouseLeave={() => setHover(null)}
            >
              {hover === entry.hour && entry.orders > 0 && (
                <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-sm bg-ink-900 px-2 py-1 text-[0.66rem] font-semibold text-white">
                  {entry.hour}h · {entry.orders} pedido{entry.orders === 1 ? '' : 's'} ·{' '}
                  {formatValue(entry.revenue, format)}
                </div>
              )}
              <div
                className={cn(
                  'w-full rounded-t-[3px] transition-all',
                  entry.orders > 0 ? 'bg-brand' : 'bg-ink-200',
                  hover === entry.hour && 'bg-brand-dark',
                )}
                style={{ height }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[0.66rem] text-ink-400">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      <p className="mt-2 text-[0.72rem] text-ink-500">
        Movimento por hora — picos indicam onde reforçar a equipe.
      </p>
    </div>
  );
}

// ── BARRA HORIZONTAL (origem, pagamento, produtos) ─────────────────────

export function BreakdownBars({
  items,
  format = 'currency',
  emptyLabel = 'Sem dados no período.',
}: {
  items: Array<{ label: string; value: number; hint?: string }>;
  format?: ValueFormat;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[0.8rem] text-ink-400">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.82rem] font-medium text-ink-700">{item.label}</span>
            <span className="flex-shrink-0 text-[0.82rem] font-bold text-ink-900">
              {formatValue(item.value, format)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.hint && <p className="mt-0.5 text-[0.68rem] text-ink-400">{item.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

// ── DONUT SIMPLES (participação por origem) ────────────────────────────

export function DonutChart({
  slices,
  size = 160,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  if (total <= 0) {
    return <p className="py-6 text-center text-[0.8rem] text-ink-400">Sem dados no período.</p>;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        viewBox="0 0 160 160"
        width={size}
        height={size}
        role="img"
        aria-label="Participação por origem"
        className="flex-shrink-0"
      >
        <g transform="rotate(-90 80 80)">
          {slices.map((slice) => {
            const fraction = slice.value / total;
            const dash = fraction * circumference;
            const element = (
              <circle
                key={slice.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="22"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return element;
          })}
        </g>
        <text
          x="80"
          y="76"
          textAnchor="middle"
          className="fill-[var(--gray-500)] text-[10px]"
        >
          pedidos
        </text>
        <text
          x="80"
          y="94"
          textAnchor="middle"
          className="fill-[var(--gray-900)] text-[18px] font-bold"
        >
          {total}
        </text>
      </svg>

      <ul className="min-w-[160px] flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[0.8rem]">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ background: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-600">{slice.label}</span>
            <span className="font-bold text-ink-800">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}


