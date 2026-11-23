'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addFromLibraryAction } from '@/app/actions/global-catalog';
import { Alert, Button, EmptyState, Field, Input, Select } from '@/components/ui';
import { formatBRL, normalizeSearchText } from '@/lib/utils';
import { ILLUSTRATIVE_LIBRARY_PHOTOS } from '@/lib/beverage-library';
import { MAX_CATALOG_SELECTION } from '@/lib/stock-policy';
import type { getBeverageLibrary } from '@/lib/data/global-catalog';
import { ProductThumb } from './ProductThumb';

type LibraryProduct = Awaited<ReturnType<typeof getBeverageLibrary>>[number];

export function BeverageLibrary({ products }: { products: LibraryProduct[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [photosOnly, setPhotosOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const categories = new Map(products.flatMap(({ globalCategory }) =>
    globalCategory ? [[globalCategory.id, globalCategory.name] as const] : [],
  ));
  const savedIds = new Set(saved);
  const belongsToStore = (item: LibraryProduct) => item.inStock || savedIds.has(item.id);
  const choices = products.filter((item) => !belongsToStore(item));
  const manufacturers = [...new Set(products.flatMap((item) => item.manufacturer ? [item.manufacturer] : []))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const categoryOptions = [...categories].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  const term = normalizeSearchText(search);
  const visible = products.filter((item) =>
    (!category || item.globalCategory?.id === category) &&
    (!manufacturer || item.manufacturer === manufacturer) &&
    (!photosOnly || Boolean(item.defaultImageUrl)) &&
    normalizeSearchText(`${item.name} ${item.brand ?? ''} ${item.manufacturer ?? ''}`).includes(term),
  );

  const visibleChoices = visible.filter((item) => !belongsToStore(item));
  const selectAll = visibleChoices.slice(0, MAX_CATALOG_SELECTION);

  function save() {
    const ids = choices.filter(({ id }) => selected.has(id)).map(({ id }) => id);
    if (!ids.length) return;
    setFeedback(null);
    start(async () => {
      try {
        const result = await addFromLibraryAction(ids);
        if (!result.ok) {
          setFeedback({ message: result.error, error: true });
          return;
        }
        if (!result.data) return;
        const { created, skipped, unavailable } = result.data;
        if (!unavailable) setSaved((previous) => [...previous, ...ids]);
        setSelected(new Set());
        const messages = [
          created ? `${created} ${created === 1 ? 'produto adicionado' : 'produtos adicionados'} ao estoque.` : '',
          skipped ? `${skipped} já no estoque.` : '',
          unavailable ? `${unavailable} deixaram de estar disponíveis na biblioteca.` : '',
        ];
        setFeedback({ message: messages.filter(Boolean).join(' ') });
        router.refresh();
      } catch {
        setFeedback({ message: 'Não foi possível salvar. Tente novamente.', error: true });
      }
    });
  }

  return (
    <section aria-label="Seleção de bebidas" className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-ink-100 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_minmax(10rem,16rem)]">
        <Field label="Buscar bebida" className="!mb-0 sm:col-span-2 lg:col-span-1">
          <Input aria-label="Buscar bebida" type="search" value={search} placeholder="Nome, marca ou fabricante" onChange={(event) => setSearch(event.target.value)} />
        </Field>
        <Field label="Categoria" className="!mb-0">
          <Select aria-label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categoryOptions.map(([id, name]) =>
              <option key={id} value={id}>{name}</option>,
            )}
          </Select>
        </Field>
        <Field label="Fabricante ou marca" className="!mb-0">
          <Select aria-label="Fabricante ou marca" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)}>
            <option value="">Todos os fabricantes</option>
            {manufacturers.map((name) => <option key={name} value={name}>{name}</option>)}
          </Select>
        </Field>
        <label className="flex min-h-7 items-center gap-2 self-center text-sm text-ink-700 sm:col-span-2 lg:col-span-3">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={photosOnly} onChange={(event) => setPhotosOnly(event.target.checked)} />
          Somente com foto
        </label>
      </div>

      {feedback && <Alert tone={feedback.error ? 'danger' : 'success'}>{feedback.message}</Alert>}

      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-100 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" aria-live="polite">{selected.size} selecionados</span>
          <Button variant="ghost" size="sm" disabled={pending || !visibleChoices.length} onClick={() => setSelected(new Set(selectAll.map(({ id }) => id)))}>
            {visibleChoices.length > selectAll.length ? `Selecionar primeiros ${selectAll.length}` : `Selecionar todos (${visibleChoices.length})`}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending || !selected.size} onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={pending} disabled={!selected.size} onClick={save}>Salvar no estoque</Button>
          <Link href="/app/estoque" className="px-2 py-2 text-sm font-semibold text-brand underline">Ir para o Estoque</Link>
        </div>
      </div>

      {visible.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => {
            const owned = belongsToStore(item);
            const checked = selected.has(item.id);
            return (
              <li key={item.id} className={`min-w-0 rounded-lg border bg-white ${checked ? 'border-brand' : 'border-ink-100'}`}>
                <label className={`flex min-h-[88px] items-center gap-3 p-3 ${owned ? '' : 'cursor-pointer'}`}>
                  <ProductThumb globalImageUrl={item.defaultImageUrl} emoji={item.emoji} alt={item.name} size={52} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-ink-900">{item.name}</span>
                    <span className="block text-xs text-ink-500">{[item.globalCategory?.name, item.manufacturer].filter(Boolean).join(' · ') || 'Sem categoria'}</span>
                    <span className="block text-xs text-ink-600">{owned ? 'No estoque' : item.suggestedPrice ? `Sugestão ${formatBRL(item.suggestedPrice)}` : 'Preço a definir'}{!item.defaultImageUrl && ' · Sem foto'}{ILLUSTRATIVE_LIBRARY_PHOTOS.has(item.slug) && item.defaultImageUrl && ' · Foto ilustrativa'}</span>
                  </span>
                  <input type="checkbox" checked={owned || checked} disabled={owned || pending || (!checked && selected.size >= MAX_CATALOG_SELECTION)} className="h-5 w-5 shrink-0 accent-[var(--brand)]" onChange={(event) => {
                    const nextChecked = event.target.checked;
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (nextChecked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }} />
                </label>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState icon="📚" title="Nenhuma bebida encontrada" description="Tente outro nome ou altere os filtros." />}
    </section>
  );
}
