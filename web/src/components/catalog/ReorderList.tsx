'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui';
import {
  reorderCategoriesAction,
  reorderFeaturedAction,
  reorderProductsAction,
} from '@/app/actions/combos';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ORDENAÇÃO POR POSITION (Fase 4.9)
 * -----------------------------------------------------------------------
 * Subir/descer, sem arrastar. Duas razões para não ter drag-and-drop
 * nesta fase: arrastar exige uma biblioteca nova (peso no bundle da tela
 * que o lojista mais usa no celular) e exige suporte a teclado para não
 * excluir quem não usa mouse. Dois botões resolvem a mesma tarefa em
 * qualquer aparelho.
 *
 * A tela manda a LISTA INTEIRA na ordem final a cada movimento. Mandar só
 * "troquei A com B" seria menos tráfego, mas dois toques rápidos
 * chegariam fora de ordem e o servidor gravaria posições repetidas — e a
 * vitrine ficaria com ordem instável até alguém reordenar de novo.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ReorderItem = { id: string; name: string; emoji?: string | null; hint?: string };

export function ReorderList({
  kind,
  items,
  disabled,
}: {
  kind: 'product' | 'category' | 'featured';
  items: ReorderItem[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * A ordem exibida é local enquanto o servidor responde. Se a gravação
   * falhar, voltamos para a lista que veio do servidor — mostrar uma
   * ordem que não foi salva seria mentir para o lojista.
   */
  const [order, setOrder] = useState<string[]>(items.map((i) => i.id));
  const byId = new Map(items.map((i) => [i.id, i]));

  // Se a lista do servidor mudou (produto novo, exclusão), a ordem local
  // fica obsoleta: reconstruímos preservando o que ainda existe.
  const [seed, setSeed] = useState(items.map((i) => i.id).join(','));
  const serverSeed = items.map((i) => i.id).join(',');
  if (seed !== serverSeed) {
    setSeed(serverSeed);
    setOrder(items.map((i) => i.id));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    setError(null);

    startTransition(async () => {
      const result =
        kind === 'product'
          ? await reorderProductsAction(next)
          : kind === 'category'
            ? await reorderCategoriesAction(next)
            : await reorderFeaturedAction(next);

      if (!result.ok) {
        setError(result.error);
        setOrder(items.map((i) => i.id));
        return;
      }
      router.refresh();
    });
  }

  const LABEL: Record<typeof kind, { empty: string; hint: string }> = {
    product: {
      empty: 'Você precisa de pelo menos 2 produtos para definir uma ordem.',
      hint: 'Esta é a ordem em que os produtos aparecem no cardápio. A busca da vitrine não depende dela.',
    },
    category: {
      empty: 'Você precisa de pelo menos 2 categorias para definir uma ordem.',
      hint: 'As categorias aparecem nesta ordem no menu da loja.',
    },
    featured: {
      empty: 'Marque produtos como destaque (★) para poder ordenar o carrossel.',
      hint: 'Esta é a ordem do carrossel no topo da loja — independente da ordem do cardápio.',
    },
  };

  if (items.length < 2) {
    return <p className="px-1 py-6 text-center text-[0.8rem] text-ink-400">{LABEL[kind].empty}</p>;
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert tone="danger" title="A ordem não foi salva">
          {error}
        </Alert>
      )}

      <ul className="divide-y divide-ink-100 overflow-hidden rounded border border-ink-200">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          const isFirst = index === 0;
          const isLast = index === order.length - 1;

          return (
            <li key={id} className="flex items-center gap-2 bg-white px-3 py-2.5">
              <span className="w-6 flex-shrink-0 text-center text-[0.72rem] font-bold text-ink-400">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.84rem] font-semibold text-ink-800">
                  {item.emoji ? `${item.emoji} ` : ''}
                  {item.name}
                </span>
                {item.hint && (
                  <span className="block text-[0.72rem] text-ink-400">{item.hint}</span>
                )}
              </span>
              <button
                type="button"
                disabled={disabled || pending || isFirst}
                onClick={() => move(index, -1)}
                aria-label={`Mover ${item.name} para cima`}
                className="h-8 w-8 flex-shrink-0 rounded-sm border border-ink-200 text-ink-500 transition-all hover:border-brand hover:text-brand disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || pending || isLast}
                onClick={() => move(index, 1)}
                aria-label={`Mover ${item.name} para baixo`}
                className="h-8 w-8 flex-shrink-0 rounded-sm border border-ink-200 text-ink-500 transition-all hover:border-brand hover:text-brand disabled:opacity-30"
              >
                ↓
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-[0.72rem] text-ink-400">
        {LABEL[kind].hint}
        {pending && <span className="ml-2 font-semibold text-brand">salvando…</span>}
      </p>
    </div>
  );
}
