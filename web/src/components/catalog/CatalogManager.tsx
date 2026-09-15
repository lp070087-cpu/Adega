'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatBRL } from '@/lib/utils';
import {
  applyTemplateAction,
  createCategoryAction,
  deleteCategoryAction,
  deleteProductAction,
  duplicateProductAction,
  toggleProductAction,
  updateCategoryAction,
  updateProductPriceAction,
} from '@/app/actions/catalog';
import { toggleFeaturedAction } from '@/app/actions/global-catalog';
import { setAvailabilityAction } from '@/app/actions/combos';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Tabs } from '@/components/ui';
import { ProductModal, type EditableProduct } from './ProductModal';
import { ProductThumb } from './ProductThumb';
import { ReorderList } from './ReorderList';
import {
  GlobalProductPicker,
  type PickerCategory,
} from './GlobalProductPicker';
import type { BusinessType } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CATÁLOGO
 * -----------------------------------------------------------------------
 * Reproduz a aba de produtos do painel: busca, filtro por categoria,
 * edição inline de preço, promoção, ativo/inativo, estoque, editar,
 * duplicar, excluir, destaque no hero, "escolher do modelo" e
 * "+ Adicionar da biblioteca".
 *
 * Toda mutação passa por server action. O preço digitado inline é
 * enviado como número e regravado no servidor — a tela nunca "decide"
 * o preço final sozinha, apenas exibe o que voltou.
 *
 * Sobre as duas origens de produto:
 *   · da biblioteca → tem globalProductId e a foto vem do arquivo
 *     compartilhado (imageUrl nulo é o normal, não um defeito)
 *   · produto próprio → sem vínculo, foto só se o lojista enviar
 * A miniatura cuida das duas sem a tela precisar saber a diferença.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type CatalogProduct = {
  id: string;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  /** Foto própria do lojista. Quando existe, vence a da biblioteca. */
  customImageUrl: string | null;
  /** Foto compartilhada da biblioteca global. */
  globalImageUrl: string | null;
  /** Presente só em produto que veio da biblioteca. */
  globalProductId: string | null;
  /** Aparece no hero da loja pública. */
  featured: boolean;
  sku: string | null;
  price: number;
  promotionalPrice: number | null;
  stock: number;
  minimumStock: number;
  trackStock: boolean;
  active: boolean;
  available: boolean;
  type: string;
  categoryId: string | null;
  categoryName: string | null;
  orderCount: number;
};

export type CatalogCategory = { id: string; name: string; emoji: string | null; count: number };

export function CatalogManager({
  products,
  categories,
  editable,
  businessTypeLabel,
  templateCount,
  businessType,
  pickerCategories,
  pickerBrands,
  ownedGlobalProductIds,
  canManage,
}: {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  /** Produtos já no formato do modal (variações/adicionais inclusos). */
  editable: Record<string, EditableProduct>;
  businessTypeLabel: string;
  templateCount: number;
  businessType: BusinessType;
  /** Categorias da biblioteca global, para o seletor. */
  pickerCategories: PickerCategory[];
  pickerBrands: string[];
  ownedGlobalProductIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive' | 'featured' | 'unavailable' | 'low' | 'out'
  >('all');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogProduct | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [priceDraft, setPriceDraft] = useState<{ id: string; value: string } | null>(null);

  /**
   * Categoria em edição. `id: null` = criação.
   *
   * Sem nome de categoria o lojista não consegue organizar o cardápio: os
   * produtos ficariam todos em "Sem categoria" e o cliente veria uma lista
   * corrida, sem as seções que a loja planejou.
   */
  const [categoryForm, setCategoryForm] = useState<{ id: string | null; name: string; emoji: string } | null>(
    null,
  );
  const [confirmCategoryDelete, setConfirmCategoryDelete] = useState<CatalogCategory | null>(null);

  /**
   * A ordenação vive numa aba própria, e não como coluna da tabela.
   * Numa lista de 300 produtos, os botões de subir/descer em cada linha
   * seriam 600 botões no meio de uma tela que existe para editar preço —
   * e a ordem só é mexida de vez em quando. Separado, cada tela faz uma
   * coisa.
   */
  const [view, setView] = useState<'catalog' | 'order'>('catalog');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryId !== 'all' && product.categoryId !== categoryId) return false;
      if (statusFilter === 'active' && !product.active) return false;
      if (statusFilter === 'inactive' && product.active) return false;
      if (statusFilter === 'featured' && !product.featured) return false;
      if (statusFilter === 'unavailable' && product.available) return false;
      if (statusFilter === 'out' && !(product.trackStock && product.stock === 0)) return false;
      if (
        statusFilter === 'low' &&
        !(product.trackStock && product.stock > 0 && product.stock <= product.minimumStock)
      ) {
        return false;
      }
      if (term) {
        const haystack = `${product.name} ${product.sku ?? ''} ${product.categoryName ?? ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [products, search, categoryId, statusFilter]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, okMessage?: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (okMessage) setSuccess(okMessage);
      router.refresh();
    });
  }

  /**
   * Salva a categoria (nova ou editada).
   *
   * `position` NÃO é enviado: o schema tem default e o servidor posiciona
   * a nova no fim da lista. Mandar zero aqui jogaria toda categoria nova
   * para o topo do menu, atropelando a ordem que o lojista já ajustou.
   */
  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryForm) return;

    const formData = new FormData();
    formData.set('name', categoryForm.name);
    formData.set('emoji', categoryForm.emoji);

    // A checagem é feita direto na variável (e não numa flag booleana)
    // porque é ela que estreita o tipo de `string | null` para `string`
    // no ramo de edição — o `updateCategoryAction` exige id de verdade.
    const id = categoryForm.id;

    run(
      () => (id === null ? createCategoryAction(formData) : updateCategoryAction(id, formData)),
      id === null ? 'Categoria criada.' : 'Categoria atualizada.',
    );
    setCategoryForm(null);
  }

  function removeCategory(category: CatalogCategory) {
    setConfirmCategoryDelete(null);
    run(
      () => deleteCategoryAction(category.id),
      // O aviso importa: excluir categoria NÃO exclui produto. Os itens
      // dela continuam vendendo, agora sem seção — e o lojista precisa
      // saber disso para não achar que perdeu o cadastro.
      `Categoria "${category.name}" excluída. Os ${category.count} produto(s) dela continuam no catálogo, agora sem categoria.`,
    );
  }

  function commitPrice(product: CatalogProduct) {
    if (!priceDraft || priceDraft.id !== product.id) return;
    const parsed = Number(priceDraft.value.replace(/\./g, '').replace(',', '.'));
    setPriceDraft(null);

    // Nada mudou: evita uma ida ao servidor à toa.
    if (!Number.isFinite(parsed) || Math.abs(parsed - product.price) < 0.005) return;

    // A promoção pode ficar inválida com o novo preço — o servidor
    // recusa e devolve o motivo, então limpamos o campo aqui.
    const promo =
      product.promotionalPrice != null && product.promotionalPrice < parsed
        ? product.promotionalPrice
        : null;

    run(() => updateProductPriceAction({ productId: product.id, price: parsed, promotionalPrice: promo }));
  }

  /**
   * Ações de uma linha.
   *
   * Ficam numa função porque a MESMA lista de botões é usada na tabela do
   * desktop e no cartão do celular. Escrever duas vezes significaria
   * corrigir duas vezes — e a segunda sempre fica para trás.
   */
  function productActions(product: CatalogProduct) {
    if (!canManage) {
      return <span className="text-[0.74rem] text-ink-400">Somente leitura</span>;
    }

    const ACTION =
      'rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold transition-all disabled:opacity-50';

    return (
      <>
        <button
          type="button"
          disabled={pending}
          title={product.featured ? 'Remover do destaque da loja' : 'Destacar no topo da loja'}
          aria-pressed={product.featured}
          onClick={() =>
            run(() =>
              toggleFeaturedAction({ productId: product.id, featured: !product.featured }),
            )
          }
          className={cn(
            'rounded-sm px-2 py-1.5 text-[0.9rem] leading-none transition-all hover:bg-ink-100 disabled:opacity-50',
            product.featured ? 'text-warn' : 'text-ink-300',
          )}
        >
          {product.featured ? '★' : '☆'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(editable[product.id] ?? null);
            setEditorOpen(true);
          }}
          className={cn(ACTION, 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')}
        >
          Editar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              toggleProductAction({ productId: product.id, field: 'active', value: !product.active }),
            )
          }
          className={cn(ACTION, 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')}
        >
          {product.active ? 'Desativar' : 'Ativar'}
        </button>
        {/*
          Disponível/Indisponível é diferente de ativo/inativo: ativo
          mantém a ficha na vitrine, indisponível avisa "acabou hoje" sem
          sumir com o produto. É o botão que o lojista usa no meio do
          turno, no celular, com pressa.
        */}
        <button
          type="button"
          disabled={pending}
          title={
            product.available
              ? 'Marcar como indisponível (some do cardápio, mas continua ativo)'
              : 'Voltar a vender este item'
          }
          onClick={() =>
            run(() =>
              setAvailabilityAction({ productId: product.id, available: !product.available }),
            )
          }
          className={cn(
            ACTION,
            product.available
              ? 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              : 'text-accent hover:bg-accent-bg',
          )}
        >
          {product.available ? 'Indisponível' : 'Disponível'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => duplicateProductAction(product.id), 'Produto duplicado (nasce inativo).')}
          className={cn(ACTION, 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')}
        >
          Duplicar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirmDelete(product)}
          className={cn(ACTION, 'text-danger hover:bg-danger-bg')}
        >
          Excluir
        </button>
      </>
    );
  }

  /** Preço: clique para editar. A gravação é no servidor. */
  function productPrice(product: CatalogProduct, size: string) {
    if (canManage && priceDraft?.id === product.id) {
      return (
        <Input
          autoFocus
          value={priceDraft.value}
          onChange={(e) => setPriceDraft({ id: product.id, value: e.target.value })}
          onBlur={() => commitPrice(product)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitPrice(product);
            if (e.key === 'Escape') setPriceDraft(null);
          }}
          inputMode="decimal"
          className="!py-1.5 text-[0.84rem]"
          aria-label={`Novo preço de ${product.name}`}
        />
      );
    }

    return (
      <button
        type="button"
        disabled={!canManage || pending}
        onClick={() => canManage && setPriceDraft({ id: product.id, value: String(product.price) })}
        className={cn(
          'text-left font-bold',
          size,
          canManage ? 'text-ink-800 hover:text-brand' : 'text-ink-700',
        )}
        title={canManage ? 'Clique para editar o preço' : undefined}
      >
        {formatBRL(product.price)}
        {product.promotionalPrice != null && product.promotionalPrice < product.price && (
          <span className="mt-0.5 block text-[0.72rem] font-semibold text-success">
            promo {formatBRL(product.promotionalPrice)}
          </span>
        )}
      </button>
    );
  }

  /** Selos de situação — iguais na tabela e no cartão. */
  function productBadges(product: CatalogProduct) {
    const low = product.trackStock && product.stock > 0 && product.stock <= product.minimumStock;
    const out = product.trackStock && product.stock === 0;
    return (
      <>
        <Badge tone="neutral">Cadastrado</Badge>
        <Badge tone={product.active ? 'green' : 'neutral'}>{product.active ? 'Ativo' : 'Inativo'}</Badge>
        {!product.available && <Badge tone="purple">Indisponível</Badge>}
        {product.featured && <Badge tone="orange">Destaque</Badge>}
        {out && <Badge tone="red">Sem estoque</Badge>}
        {low && <Badge tone="yellow">Repor</Badge>}
      </>
    );
  }

  /**
   * A regra da vitrine (REGRA 5) resumida numa linha: só aparece em
   * público o produto que está cadastrado, ativo, disponível e — quando o
   * estoque é controlado — com saldo maior que zero. A leitura é feita
   * pelas MESMAS colunas que já existem no banco; nada novo foi criado.
   */
  function publicState(product: CatalogProduct): { tone: 'green' | 'red' | 'yellow'; label: string } {
    const out = product.trackStock && product.stock === 0;
    if (!product.active) return { tone: 'red', label: 'Fora da vitrine (inativo)' };
    if (!product.available) return { tone: 'red', label: 'Fora da vitrine (indisponível)' };
    if (out) return { tone: 'red', label: 'Fora da vitrine (sem estoque)' };
    if (product.featured) return { tone: 'yellow', label: 'Na vitrine · em destaque' };
    return { tone: 'green', label: 'Na vitrine' };
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}
      {success && (
        <Alert tone="success" title={success}>
          A lista foi atualizada.
        </Alert>
      )}

      <Tabs
        tabs={[
          { value: 'catalog', label: `Produtos (${products.length})` },
          { value: 'order', label: 'Ordem de exibição' },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'order' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-ink-100 bg-white p-4">
            <h3 className="mb-1 text-[0.92rem] font-bold text-ink-900">Produtos</h3>
            <p className="mb-3 text-[0.76rem] text-ink-500">
              A ordem em que o cardápio apresenta os itens dentro de cada categoria.
            </p>
            <ReorderList
              kind="product"
              disabled={!canManage}
              items={products.map((product) => ({
                id: product.id,
                name: product.name,
                emoji: product.emoji,
                hint: [product.categoryName ?? 'Sem categoria', product.sku]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-ink-100 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="mb-1 text-[0.92rem] font-bold text-ink-900">Categorias</h3>
                  <p className="text-[0.76rem] text-ink-500">
                    A ordem em que as categorias aparecem no menu da loja.
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setCategoryForm({ id: null, name: '', emoji: '' })}
                  >
                    + Nova categoria
                  </Button>
                )}
              </div>

              {categories.length === 0 ? (
                <p className="rounded border border-dashed border-ink-200 px-4 py-5 text-center text-[0.78rem] text-ink-500">
                  Nenhuma categoria ainda. Crie a primeira para organizar o cardápio.
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {categories.map((category) => (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <span className="flex-1 truncate text-[0.84rem] font-semibold text-ink-800">
                        {category.emoji ? `${category.emoji} ` : ''}
                        {category.name}
                      </span>
                      <span className="text-[0.72rem] text-ink-400">
                        {category.count} produto{category.count === 1 ? '' : 's'}
                      </span>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              setCategoryForm({
                                id: category.id,
                                name: category.name,
                                emoji: category.emoji ?? '',
                              })
                            }
                            className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setConfirmCategoryDelete(category)}
                            className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-danger transition-all hover:bg-danger-bg disabled:opacity-50"
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/*
                A ordenação vive embaixo da lista, e não em cada linha: numa
                loja com 15 categorias seriam 30 botões de seta no meio de
                uma tela que existe para nomear e excluir. Separado, cada
                controle faz uma coisa.
              */}
              {categories.length > 1 && (
                <div className="mt-4 border-t border-ink-100 pt-3">
                  <p className="mb-2 text-[0.74rem] font-bold uppercase tracking-wide text-ink-400">
                    Ordem no menu
                  </p>
                  <ReorderList
                    kind="category"
                    disabled={!canManage}
                    items={categories.map((category) => ({
                      id: category.id,
                      name: category.name,
                      emoji: category.emoji,
                      hint: `${category.count} produto${category.count === 1 ? '' : 's'}`,
                    }))}
                  />
                </div>
              )}
            </div>

            <div className="rounded-lg border border-ink-100 bg-white p-4">
              <h3 className="mb-1 text-[0.92rem] font-bold text-ink-900">Destaques do topo</h3>
              <p className="mb-3 text-[0.76rem] text-ink-500">
                Ordem do carrossel principal. Marque produtos com ★ na aba de produtos para
                trazê-los para cá.
              </p>
              <ReorderList
                kind="featured"
                disabled={!canManage}
                items={products
                  .filter((product) => product.featured)
                  .map((product) => ({
                    id: product.id,
                    name: product.name,
                    emoji: product.emoji,
                    hint: product.categoryName ?? 'Sem categoria',
                  }))}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* ── Barra de ações ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 bg-white p-3.5">
        <div className="min-w-[200px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU ou categoria..."
            aria-label="Buscar produto"
          />
        </div>

        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-auto min-w-[150px]"
          aria-label="Filtrar por categoria"
        >
          <option value="all">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.emoji ? `${category.emoji} ` : ''}
              {category.name} ({category.count})
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="w-auto min-w-[140px]"
          aria-label="Filtrar por situação"
        >
          <option value="all">Todas as situações</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
          <option value="featured">Em destaque</option>
          <option value="unavailable">Indisponíveis</option>
          <option value="low">Estoque baixo</option>
          <option value="out">Sem estoque</option>
        </Select>

        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setLibraryOpen(true)}
              disabled={pending}
              title="Produtos prontos da plataforma, com imagem compartilhada"
            >
              + Adicionar da biblioteca
            </Button>
            <Button variant="secondary" onClick={() => setTemplateOpen(true)} disabled={pending}>
              Escolher do modelo
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              disabled={pending}
            >
              + Novo produto
            </Button>
          </div>
        )}
      </div>

      {/* ── Regra da vitrine ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-ink-100 bg-white px-3.5 py-2.5 text-[0.72rem] text-ink-500">
        <span className="font-bold uppercase tracking-wide text-ink-400">Vitrine</span>
        <span>
          Só aparece em público quem está <strong>cadastrado</strong>, <strong>ativo</strong>,{' '}
          <strong>disponível</strong> e, com estoque controlado, <strong>com saldo</strong>. O
          destaque (★) dá posição no topo, não a publicação.
        </span>
      </div>

      {/* ── Tabela ───────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-ink-100 bg-white">
          <EmptyState
            icon="🏷️"
            title={products.length === 0 ? 'Nenhum produto cadastrado' : 'Nada encontrado'}
            description={
              products.length === 0
                ? `Adicione produtos da biblioteca da plataforma, use o catálogo-modelo de ${businessTypeLabel} (${templateCount} itens) ou cadastre o primeiro produto.`
                : 'Ajuste a busca ou os filtros para ver outros itens.'
            }
            action={
              canManage && products.length === 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setLibraryOpen(true)}>Adicionar da biblioteca</Button>
                  <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
                    Usar o catálogo-modelo
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-ink-100 bg-white">
          {/*
            MOBILE: cartões. Uma tabela de 720px num telefone de 375px
            obriga a rolar de lado para descobrir que existe um botão
            "Excluir" — e o lojista mexe no catálogo pelo celular, no meio
            do turno. No desktop a tabela continua, porque lá ela é melhor.
          */}
          <ul className="divide-y divide-ink-100 lg:hidden">
            {visible.map((product) => (
              <li key={product.id} className="p-3.5">
                <div className="flex items-start gap-3">
                  <ProductThumb
                    customImageUrl={product.customImageUrl}
                    globalImageUrl={product.globalImageUrl}
                    emoji={product.emoji}
                    alt={product.name}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.88rem] font-bold text-ink-900">{product.name}</p>
                    <p className="truncate text-[0.72rem] text-ink-400">
                      {product.categoryName ?? 'Sem categoria'}
                      {product.sku ? ` · ${product.sku}` : ''}
                    </p>
                    <div className="mt-1.5">{productPrice(product, 'text-[0.9rem]')}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {productBadges(product)}
                      {product.trackStock && (
                        <span className="text-[0.72rem] font-semibold text-ink-500">
                          {product.stock} un.
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(() => {
                        const state = publicState(product);
                        return <Badge tone={state.tone}>{state.label}</Badge>;
                      })()}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-ink-100 pt-2.5">
                  {productActions(product)}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50 text-left">
                  <Th>Produto</Th>
                  <Th className="w-[150px]">Preço</Th>
                  <Th className="w-[110px]">Estoque</Th>
                  <Th className="w-[120px]">Situação</Th>
                  <Th className="w-[240px] text-right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((product) => {
                  const low =
                    product.trackStock && product.stock > 0 && product.stock <= product.minimumStock;
                  const out = product.trackStock && product.stock === 0;
                  return (
                    <tr key={product.id} className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ProductThumb
                            customImageUrl={product.customImageUrl}
                            globalImageUrl={product.globalImageUrl}
                            emoji={product.emoji}
                            alt={product.name}
                            size={36}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[0.86rem] font-semibold text-ink-800">
                              {product.name}
                            </span>
                            <span className="block text-[0.72rem] text-ink-400">
                              {product.categoryName ?? 'Sem categoria'}
                              {product.sku ? ` · ${product.sku}` : ''}
                              {product.orderCount > 0 ? ` · ${product.orderCount} vendas` : ''}
                              {/* Deixa claro de onde veio a foto, já que
                                  não existe arquivo próprio neste caso. */}
                              {product.globalProductId && !product.customImageUrl
                                ? ' · imagem da biblioteca'
                                : product.customImageUrl
                                  ? ' · imagem própria'
                                  : ''}
                            </span>
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">{productPrice(product, 'text-[0.86rem]')}</td>

                      <td className="px-4 py-3">
                        {product.trackStock ? (
                          <span
                            className={cn(
                              'text-[0.84rem] font-semibold',
                              out ? 'text-danger' : low ? 'text-warn' : 'text-ink-700',
                            )}
                          >
                            {product.stock} un.
                          </span>
                        ) : (
                          <span className="text-[0.78rem] text-ink-400">não controlado</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">{productBadges(product)}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {(() => {
                            const state = publicState(product);
                            return <Badge tone={state.tone}>{state.label}</Badge>;
                          })()}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {productActions(product)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-ink-100 px-4 py-2.5 text-[0.76rem] text-ink-500">
            {visible.length} de {products.length} produto{products.length === 1 ? '' : 's'}
            {pending && <span className="ml-2 text-brand">salvando...</span>}
          </div>
        </div>
      )}
        </>
      )}

      {/* ── Biblioteca da plataforma ──────────────────────────────── */}
      <GlobalProductPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        categories={pickerCategories}
        brands={pickerBrands}
        businessType={businessType}
        ownedGlobalProductIds={ownedGlobalProductIds}
        storeCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
        mode="catalog"
        onAdded={(result) => {
          if (result.created > 0) {
            setSuccess(
              `${result.created} produto${result.created === 1 ? '' : 's'} adicionado${
                result.created === 1 ? '' : 's'
              } da biblioteca.`,
            );
          }
          // `skipped` alto com `created` zero costuma ser engano do
          // lojista, não erro — vale dizer em vez de ficar em silêncio.
          if (result.created === 0 && result.skipped > 0) {
            setSuccess('Os itens escolhidos já estavam no seu catálogo.');
          }
        }}
      />

      {/* ── Modal de produto ──────────────────────────────────────── */}
      {editorOpen && (
        <ProductModal
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          product={editing}
          categories={categories.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
        />
      )}

      {/* ── Confirmar exclusão ────────────────────────────────────── */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        title="Excluir produto"
        subtitle="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const target = confirmDelete;
                setConfirmDelete(null);
                if (target) run(() => deleteProductAction(target.id));
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-[0.84rem] leading-relaxed text-ink-600">
          <strong className="text-ink-900">{confirmDelete?.name}</strong> será removido do
          catálogo. Os pedidos já feitos que contêm este item <strong>não</strong> são alterados —
          cada item de pedido guarda o próprio nome e preço.
        </p>
      </Modal>

      {/* ── Nova categoria / editar categoria ─────────────────────── */}
      <Modal
        open={Boolean(categoryForm)}
        onClose={() => setCategoryForm(null)}
        title={categoryForm?.id ? 'Editar categoria' : 'Nova categoria'}
        subtitle="Aparece como seção no cardápio da loja."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCategoryForm(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" form="category-form" loading={pending}>
              Salvar
            </Button>
          </>
        }
      >
        {/* `key` força o formulário a remontar ao trocar de categoria: sem
            ele, abrir "Editar" logo após criar mostraria o texto anterior. */}
        <form
          key={categoryForm?.id ?? 'new'}
          id="category-form"
          onSubmit={submitCategory}
          className="space-y-3.5"
        >
          <Field label="Nome da categoria" required>
            <Input
              value={categoryForm?.name ?? ''}
              onChange={(e) =>
                setCategoryForm((current) =>
                  current ? { ...current, name: e.target.value } : current,
                )
              }
              required
              minLength={2}
              maxLength={60}
              placeholder="Ex.: Cervejas, Pizzas salgadas, Bebidas"
              autoFocus
            />
          </Field>

          <Field label="Emoji" hint="Um só, opcional. Aparece antes do nome." className="mb-0">
            <Input
              value={categoryForm?.emoji ?? ''}
              onChange={(e) =>
                setCategoryForm((current) =>
                  current ? { ...current, emoji: e.target.value } : current,
                )
              }
              maxLength={8}
              placeholder="🍺"
            />
          </Field>
        </form>
      </Modal>

      {/* ── Confirmar exclusão de categoria ───────────────────────── */}
      <Modal
        open={Boolean(confirmCategoryDelete)}
        onClose={() => setConfirmCategoryDelete(null)}
        title="Excluir categoria"
        subtitle="Esta ação não pode ser desfeita."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmCategoryDelete(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => confirmCategoryDelete && removeCategory(confirmCategoryDelete)}
            >
              Excluir categoria
            </Button>
          </>
        }
      >
        <p className="text-[0.84rem] leading-relaxed text-ink-600">
          <strong className="text-ink-900">{confirmCategoryDelete?.name}</strong> será removida do
          cardápio.{' '}
          {confirmCategoryDelete && confirmCategoryDelete.count > 0 ? (
            <>
              Os <strong>{confirmCategoryDelete.count}</strong> produto
              {confirmCategoryDelete.count === 1 ? '' : 's'} desta categoria{' '}
              <strong>não</strong> serão excluídos — eles continuam no catálogo e passam a
              aparecer em &ldquo;Sem categoria&rdquo; até você encaixá-los em outra seção.
            </>
          ) : (
            'A categoria está vazia, nenhum produto será afetado.'
          )}
        </p>
      </Modal>

      {/* ── Catálogo-modelo do segmento ───────────────────────────── */}
      <Modal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title={`Catálogo-modelo de ${businessTypeLabel}`}
        subtitle={`${templateCount} produtos sugeridos, com preços de referência.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                setTemplateOpen(false);
                run(
                  () => applyTemplateAction({ replaceExisting }),
                  'Catálogo-modelo aplicado.',
                );
              }}
            >
              Aplicar modelo
            </Button>
          </>
        }
      >
        <p className="mb-3 text-[0.84rem] leading-relaxed text-ink-600">
          Os itens do modelo são <strong>copiados</strong> para o seu catálogo. Depois disso eles
          são seus: editar o modelo não muda mais nada na sua loja.
        </p>
        <ul className="mb-3 space-y-1.5 text-[0.8rem] text-ink-600">
          <li>· Produtos que já existem pelo mesmo nome são mantidos como estão.</li>
          <li>· Nada é duplicado se você aplicar o modelo mais de uma vez.</li>
        </ul>

        <label className="flex cursor-pointer items-start gap-2.5 rounded border-2 border-warn/25 bg-warn-bg px-3.5 py-3 text-[0.8rem] text-ink-700">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-[var(--orange)]"
          />
          <span>
            <strong className="text-warn">Substituir o catálogo atual.</strong> Apaga categorias e
            os produtos que <strong>nunca foram vendidos</strong>. Itens já vendidos permanecem
            para não reescrever o histórico.
          </span>
        </label>
      </Modal>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[0.7rem] font-bold uppercase tracking-wide text-ink-500',
        className,
      )}
    >
      {children}
    </th>
  );
}


