'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from './index';

/**
 * Tabela de dados do painel.
 *
 * Reproduz a tabela de plataforma.html: cabeçalho fixo em maiúsculas
 * pequenas, linhas com hover, e no mobile as colunas viram cartões (role
 * e aria preservados — a tabela continua sendo uma tabela de verdade,
 * só que rolável).
 */

export type Column<T> = {
  key: string;
  header: string;
  /** Largura/alinhamento opcionais, ex.: 'w-[120px]' ou 'text-right'. */
  className?: string;
  /** Se true, a coluna some no mobile (telas estreitas). */
  hideOnMobile?: boolean;
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  keyOf,
  onRowClick,
  empty,
  loading = false,
  footer,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  keyOf: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: { icon?: string; title: string; description?: string; action?: React.ReactNode };
  loading?: boolean;
  footer?: React.ReactNode;
}) {
  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-ink-100 bg-white">
        <EmptyState
          icon={empty?.icon}
          title={empty?.title ?? 'Nada por aqui'}
          description={empty?.description}
          action={empty?.action}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink-100 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-[0.68rem] font-bold uppercase tracking-[0.04em] text-ink-500',
                    column.hideOnMobile && 'hidden lg:table-cell',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-ink-100">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn('px-4 py-3.5', column.hideOnMobile && 'hidden lg:table-cell')}
                      >
                        <span className="block h-3.5 w-full max-w-[120px] animate-pulse-soft rounded-sm bg-ink-100" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={keyOf(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-ink-100 transition-colors last:border-b-0',
                      onRowClick && 'cursor-pointer hover:bg-brand-light/40',
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-3.5 align-middle text-[0.84rem] text-ink-700',
                          column.hideOnMobile && 'hidden lg:table-cell',
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {footer && <div className="border-t border-ink-100 px-4 py-3">{footer}</div>}
    </div>
  );
}

/**
 * Cartões de métrica em faixa. Usado no topo das listas (catálogo,
 * clientes, estoque) para dar o resumo antes da tabela.
 */
export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; tone?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-ink-100 bg-white px-4 py-3.5">
          <p className="text-[0.72rem] font-medium text-ink-500">{item.label}</p>
          <p className="mt-1 text-[1.2rem] font-extrabold leading-none text-ink-900">{item.value}</p>
          {item.hint && <p className="mt-1 text-[0.7rem] text-ink-400">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/** Barra de filtros com busca e selects — topo das listas. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-lg border border-ink-100 bg-white p-3.5">
      {children}
    </div>
  );
}

/** Paginação simples. Os números vêm do servidor (totalPages). */
export function Pagination({
  page,
  totalPages,
  onChange,
  total,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  total?: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[0.76rem] text-ink-500">
        Página {page} de {totalPages}
        {total !== undefined && ` · ${total} registros`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-sm border-2 border-ink-200 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-600 transition-all hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-sm border-2 border-ink-200 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-600 transition-all hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
