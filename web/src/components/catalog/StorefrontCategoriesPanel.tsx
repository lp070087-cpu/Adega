'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/components/ui';
import { saveStorefrontCategoriesAction } from '@/app/actions/combos';
import { storefrontCategoryView, type StorefrontCategories } from '@/lib/storefront-categories';

/**
 * Categorias na vitrine: navegação principal (chips) e "Mostrar todos".
 * Desligar as duas oculta a categoria na vitrine sem apagar nada.
 */
export function StorefrontCategoriesPanel({ categories, initial, disabled }: { categories: Array<{ id: string; name: string; productCount?: number }>; initial: StorefrontCategories; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const all = categories.map((c) => c.id);
  const [nav, setNav] = useState<Set<string>>(new Set(initial.nav ?? all));
  const [showAll, setShowAll] = useState<Set<string>>(new Set(initial.showAll ?? all));
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const preview = useMemo(() => storefrontCategoryView(categories, { nav: [...nav], showAll: [...showAll] }), [categories, nav, showAll]);
  const toggle = (set: Set<string>, update: (next: Set<string>) => void, id: string) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); update(next); setMessage(null); };

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveStorefrontCategoriesAction({ nav: all.filter((id) => nav.has(id)), showAll: all.filter((id) => showAll.has(id)) });
      if (!result.ok) { setMessage({ tone: 'danger', text: result.error }); return; }
      setMessage({ tone: 'success', text: 'Vitrine atualizada.' });
      router.refresh();
    });
  }

  if (categories.length === 0) return null;
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4" data-testid="storefront-categories">
      <h3 className="mb-1 text-[0.92rem] font-bold text-ink-900">Categorias na vitrine</h3>
      <p className="mb-3 text-[0.76rem] text-ink-500">Escolha onde cada categoria aparece. Desligar as duas opções oculta a categoria na vitrine; nenhum produto é apagado. A ordem é a da lista de categorias.</p>
      {message && <Alert tone={message.tone} className="mb-3">{message.text}</Alert>}
      <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
        {categories.map((category) => {
          const hidden = !nav.has(category.id) && !showAll.has(category.id);
          return (
            <li key={category.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 break-words text-[0.84rem] font-semibold text-ink-800">
                {category.name}
                {hidden && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-[0.68rem] font-bold text-ink-500">Oculta</span>}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex min-h-11 items-center gap-2 text-[0.78rem] text-ink-700"><input type="checkbox" className="h-5 w-5" disabled={disabled} checked={nav.has(category.id)} onChange={() => toggle(nav, setNav, category.id)} aria-label={`${category.name} na navegação principal`} />Navegação</label>
                <label className="flex min-h-11 items-center gap-2 text-[0.78rem] text-ink-700"><input type="checkbox" className="h-5 w-5" disabled={disabled} checked={showAll.has(category.id)} onChange={() => toggle(showAll, setShowAll, category.id)} aria-label={`${category.name} em Mostrar todos`} />Mostrar todos</label>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-lg bg-ink-50 p-3 text-[0.76rem] text-ink-600" aria-live="polite">
        <p className="font-semibold text-ink-800">Prévia</p>
        <p className="mt-1"><span className="font-semibold">Navegação:</span> Mostrar todos{preview.nav.map((c) => ` · ${c.name}`).join('')}</p>
        <p className="mt-0.5"><span className="font-semibold">Em “Mostrar todos”:</span> {preview.showAll.length ? preview.showAll.map((c) => c.name).join(', ') : 'nenhuma categoria'}</p>
        {preview.hidden.length > 0 && <p className="mt-0.5"><span className="font-semibold">Ocultas:</span> {preview.hidden.map((c) => c.name).join(', ')}</p>}
      </div>
      {!disabled && <Button className="mt-3 min-h-11" onClick={save} loading={pending}>Salvar vitrine</Button>}
    </div>
  );
}
