'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Drawer,
  Field,
  Input,
  Select,
  EmptyState,
} from '@/components/ui';
import { ProductThumb } from '@/components/catalog/ProductThumb';
import { addFromLibraryAction, searchGlobalProductsAction } from '@/app/actions/global-catalog';
import { formatBRL, cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * "+ ADICIONAR DA BIBLIOTECA"
 * -----------------------------------------------------------------------
 * Abre a biblioteca da plataforma com busca, categoria, marca e segmento
 * recomendado. O lojista marca o que quer e adiciona ao catálogo dele.
 *
 * O ponto central: o que é adicionado vira um Product DA LOJA (ele pode
 * renomear, precificar, desativar). O que NÃO acontece é copiar o arquivo
 * de imagem — o Product guarda só o vínculo com o global, então 500
 * lojas vendendo a mesma Coca-Cola continuam com um arquivo só no disco.
 *
 * Itens que a loja já tem aparecem marcados como "no seu catálogo" e não
 * são recriados.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type PickerCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  fullName: string;
  productCount: number;
};

export type PickerProduct = {
  id: string;
  name: string;
  brand: string | null;
  emoji: string | null;
  defaultImageUrl: string | null;
  volume: number | null;
  unit: string | null;
  packSize: number;
  suggestedPrice: number | null;
  barcode: string | null;
  globalCategory: { name: string; slug: string; icon: string | null; imagePath: string | null } | null;
  businessTypes: Array<{ businessType: string; weight: number }>;
};

export type GlobalProductPickerProps = {
  open: boolean;
  onClose: () => void;
  categories: PickerCategory[];
  brands: string[];
  /** Segmento da loja — pré-filtra e ordena por recomendação. */
  businessType?: string | null;
  /** Ids de globais que a loja já tem, para marcar como existente. */
  ownedGlobalProductIds?: string[];
  /** Categorias do catálogo da loja, para o destino opcional. */
  storeCategories?: Array<{ id: string; name: string }>;
  /** Rótulo do contexto: "onboarding" mostra preços de uma vez. */
  mode?: 'catalog' | 'onboarding';
  onAdded?: (result: { created: number; skipped: number }) => void;
};

export function GlobalProductPicker({
  open,
  onClose,
  categories,
  brands,
  businessType,
  ownedGlobalProductIds = [],
  storeCategories = [],
  mode = 'catalog',
  onAdded,
}: GlobalProductPickerProps) {
  const router = useRouter();
  const owned = React.useMemo(() => new Set(ownedGlobalProductIds), [ownedGlobalProductIds]);

  const [search, setSearch] = React.useState('');
  const [categorySlug, setCategorySlug] = React.useState('');
  const [brand, setBrand] = React.useState('');
  const [onlyRecommended, setOnlyRecommended] = React.useState(Boolean(businessType));
  const [destinationCategory, setDestinationCategory] = React.useState('');

  const [items, setItems] = React.useState<PickerProduct[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [prices, setPrices] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  // Busca com atraso: digitar rápido não dispara uma consulta por letra.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      const result = await searchGlobalProductsAction({
        search: search || undefined,
        categorySlug: categorySlug || undefined,
        brand: brand || undefined,
        businessType: onlyRecommended && businessType ? (businessType as never) : undefined,
        page: 1,
      });
      if (cancelled) return;

      if (result.ok && result.data) {
        setItems(result.data.items as unknown as PickerProduct[]);
        setTotal(result.data.total);
        setError(null);
      } else {
        setError(result.ok ? 'Não foi possível carregar a biblioteca.' : result.error);
      }
      setLoading(false);
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setLoading(false);
    };
  }, [open, search, categorySlug, brand, onlyRecommended, businessType]);

  // Fecha e limpa: reabrir não deve trazer a seleção anterior.
  React.useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setPrices({});
      setError(null);
    }
  }, [open]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of items) {
        // Já no catálogo não entra: não haveria o que criar.
        if (!owned.has(item.id)) next.add(item.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleAdd() {
    if (selected.size === 0) {
      setError('Selecione ao menos um produto.');
      return;
    }
    setSaving(true);
    setError(null);

    // Preços digitados viram número; vazio significa "usar o sugerido".
    const priceMap: Record<string, number> = {};
    for (const [id, raw] of Object.entries(prices)) {
      if (!selected.has(id)) continue;
      const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
      const value = Number(normalized);
      if (Number.isFinite(value) && value >= 0) priceMap[id] = value;
    }

    const formData = new FormData();
    formData.set('productIds', JSON.stringify(Array.from(selected)));
    formData.set('prices', JSON.stringify(priceMap));
    if (destinationCategory) formData.set('categoryId', destinationCategory);
    formData.set('skipExisting', 'true');

    const result = await addFromLibraryAction(formData);
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onAdded?.({
      created: result.data?.created ?? 0,
      skipped: result.data?.skipped ?? 0,
    });
    setSelected(new Set());
    setPrices({});
    router.refresh();
    onClose();
  }

  const selectedCount = Array.from(selected).filter((id) => !owned.has(id)).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Adicionar da biblioteca"
      subtitle="Produtos da plataforma, prontos para vender. Você define o preço depois."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} loading={saving} disabled={selectedCount === 0}>
            Adicionar ao meu catálogo
            {selectedCount > 0 && ` (${selectedCount})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Alert tone="neutral">
          A imagem é compartilhada: o produto entra no seu catálogo apontando para a foto da
          biblioteca. Você só cria um arquivo novo se enviar uma foto própria.
        </Alert>

        {/* ── Filtros ── */}
        <div className="space-y-2.5">
          <Input
            placeholder="Buscar por nome, marca ou código de barras…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar na biblioteca"
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              aria-label="Categoria"
            >
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category.id} value={category.slug}>
                  {category.fullName} ({category.productCount})
                </option>
              ))}
            </Select>

            <Select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca">
              <option value="">Todas as marcas</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>

          {businessType && (
            <Checkbox
              label="Só o que é recomendado para o meu segmento"
              checked={onlyRecommended}
              onChange={(e) => setOnlyRecommended(e.target.checked)}
            />
          )}

          {storeCategories.length > 0 && (
            <Field label="Colocar em qual categoria do meu catálogo?" className="mb-0">
              <Select
                value={destinationCategory}
                onChange={(e) => setDestinationCategory(e.target.value)}
              >
                <option value="">Automático (pela categoria de origem)</option>
                {storeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {/* ── Ações de seleção ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-ink-100 py-2.5">
          <span className="text-[0.76rem] text-ink-500">
            {loading ? 'Carregando…' : `${total} produto(s) na biblioteca`}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={selectAllVisible} disabled={loading}>
              Selecionar todos
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={selected.size === 0}
            >
              Limpar seleção
            </Button>
          </div>
        </div>

        {/* ── Lista ── */}
        {items.length === 0 && !loading ? (
          <EmptyState
            icon="🔍"
            title="Nada encontrado na biblioteca"
            description={
              search || categorySlug || brand
                ? 'Tente outra busca ou remova os filtros. Você também pode criar o produto do zero em "+ Criar produto próprio".'
                : 'A biblioteca ainda está sendo montada. Enquanto isso, use "+ Criar produto próprio".'
            }
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const isOwned = owned.has(item.id);
              const isSelected = selected.has(item.id);

              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded border-2 p-2.5 transition-all',
                    isOwned
                      ? 'border-ink-100 bg-ink-50 opacity-70'
                      : isSelected
                        ? 'border-brand bg-brand-light/40'
                        : 'border-ink-100 hover:border-ink-200',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--orange)]"
                      checked={isSelected}
                      disabled={isOwned}
                      onChange={() => toggle(item.id)}
                      aria-label={`Selecionar ${item.name}`}
                    />

                    <ProductThumb
                      customImageUrl={null}
                      globalImageUrl={item.defaultImageUrl}
                      basePath={
                        item.globalCategory
                          ? `${item.globalCategory.imagePath ?? ''}`.trim() || null
                          : null
                      }
                      emoji={item.emoji}
                      alt={item.name}
                      size={52}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[0.86rem] font-bold text-ink-900">{item.name}</p>
                        {item.brand && (
                          <span className="text-[0.72rem] text-ink-500">{item.brand}</span>
                        )}
                        {isOwned && <Badge tone="green">no seu catálogo</Badge>}
                      </div>

                      <p className="mt-0.5 text-[0.72rem] text-ink-500">
                        {item.globalCategory?.name ?? 'Sem categoria'}
                        {item.volume
                          ? ` · ${item.volume}${item.unit ? ` ${item.unit}` : ''}`
                          : ''}
                        {item.packSize > 1 ? ` · fardo c/ ${item.packSize}` : ''}
                        {item.suggestedPrice ? ` · sugerido ${formatBRL(item.suggestedPrice)}` : ''}
                      </p>

                      {isSelected && !isOwned && (
                        <div className="mt-2 max-w-[160px]">
                          <Input
                            inputMode="decimal"
                            placeholder={
                              item.suggestedPrice
                                ? String(item.suggestedPrice).replace('.', ',')
                                : '0,00'
                            }
                            value={prices[item.id] ?? ''}
                            onChange={(e) =>
                              setPrices((current) => ({ ...current, [item.id]: e.target.value }))
                            }
                            aria-label={`Preço de ${item.name}`}
                            className="!py-1.5 text-[0.78rem]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {mode === 'onboarding' && (
          <p className="text-[0.72rem] text-ink-400">
            Você poderá ajustar nome, foto, descrição, estoque e preço de cada item depois, sem
            que isso mude o produto da biblioteca.
          </p>
        )}
      </div>
    </Drawer>
  );
}
