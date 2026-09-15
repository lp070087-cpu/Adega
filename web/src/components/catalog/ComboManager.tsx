'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatBRL } from '@/lib/utils';
import {
  createComboAction,
  deleteComboAction,
  updateComboAction,
} from '@/app/actions/combos';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { ProductThumb } from './ProductThumb';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBOS (Fase 4.15)
 * -----------------------------------------------------------------------
 * Um combo é um PRODUTO vendável com uma composição. Os itens são
 * produtos QUE JÁ EXISTEM na loja, referenciados — nunca copiados. Copiar
 * criaria um segundo cadastro do mesmo refrigerante, com preço e estoque
 * que passariam a divergir no dia seguinte.
 *
 * O preço é do combo, digitado pelo lojista. A soma dos itens aparece ao
 * lado como referência de decisão ("vendendo separado dá R$ 42,00") — não
 * como preço sugerido pela plataforma, porque quem decide a margem é ele.
 *
 * Os ids que sobem são só ids: nome e preço vêm do banco no servidor. Se
 * alguém trocar um id no DevTools, a action recusa por posse — o item não
 * pertence a esta organização.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ComboCandidate = {
  id: string;
  name: string;
  emoji: string | null;
  price: number;
  categoryId: string | null;
};

export type ComboRow = {
  id: string;
  name: string;
  emoji: string | null;
  customImageUrl: string | null;
  globalImageUrl: string | null;
  price: number;
  promotionalPrice: number | null;
  active: boolean;
  available: boolean;
  featured: boolean;
  categoryId: string | null;
  separateTotal: number;
  items: Array<{ productId: string; name: string; emoji: string | null; quantity: number }>;
};

type DraftItem = { productId: string; quantity: number };

type Draft = {
  id: string | null;
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  promotionalPrice: string;
  categoryId: string;
  active: boolean;
  featured: boolean;
  trackStock: boolean;
  stock: string;
  items: DraftItem[];
};

function emptyDraft(): Draft {
  return {
    id: null,
    name: '',
    description: '',
    imageUrl: '',
    price: '',
    promotionalPrice: '',
    categoryId: '',
    active: true,
    featured: false,
    trackStock: false,
    stock: '0',
    items: [],
  };
}

export function ComboManager({
  combos,
  candidates,
  categories,
  businessTypeLabel,
  canManage,
}: {
  combos: ComboRow[];
  candidates: ComboCandidate[];
  categories: Array<{ id: string; name: string; emoji: string | null }>;
  businessTypeLabel: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ComboRow | null>(null);

  const candidateMap = useMemo(
    () => new Map(candidates.map((c) => [c.id, c])),
    [candidates],
  );

  const visibleCandidates = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return candidates;
    const categoryName = (id: string | null) =>
      categories.find((c) => c.id === id)?.name ?? '';
    return candidates.filter((c) =>
      `${c.name} ${categoryName(c.categoryId)}`.toLowerCase().includes(term),
    );
  }, [candidates, categories, itemSearch]);

  /** Soma dos itens escolhidos, para referência durante a edição. */
  const draftSeparateTotal = useMemo(() => {
    if (!draft) return 0;
    return draft.items.reduce((sum, item) => {
      const candidate = candidateMap.get(item.productId);
      return sum + (candidate?.price ?? 0) * item.quantity;
    }, 0);
  }, [draft, candidateMap]);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  function save() {
    if (!draft) return;
    setError(null);
    setFieldError(null);

    // O envio é numérico: "29,90" precisa virar 29.9 antes de sair daqui,
    // senão a validação do servidor recusa por formato e o lojista não
    // entende o motivo.
    const payload = {
      name: draft.name,
      description: draft.description,
      imageUrl: draft.imageUrl,
      price: parseMoney(draft.price),
      promotionalPrice: draft.promotionalPrice.trim() ? parseMoney(draft.promotionalPrice) : undefined,
      categoryId: draft.categoryId,
      active: draft.active,
      featured: draft.featured,
      trackStock: draft.trackStock,
      stock: Number(draft.stock) || 0,
      items: draft.items,
    };

    startTransition(async () => {
      const result = draft.id
        ? await updateComboAction(draft.id, payload)
        : await createComboAction(payload);

      if (!result.ok) {
        setError(result.error);
        setFieldError(result.field ?? null);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  function toggleItem(productId: string) {
    if (!draft) return;
    const exists = draft.items.some((i) => i.productId === productId);
    setDraft({
      ...draft,
      items: exists
        ? draft.items.filter((i) => i.productId !== productId)
        : [...draft.items, { productId, quantity: 1 }],
    });
  }

  function setQuantity(productId: string, quantity: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(1, Math.min(99, quantity)) } : i,
      ),
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.05rem] font-extrabold text-ink-900">Combos</h2>
          <p className="text-[0.8rem] text-ink-500">
            {combos.length} combo{combos.length === 1 ? '' : 's'} montado
            {combos.length === 1 ? '' : 's'} com produtos que já existem no seu catálogo.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setDraft(emptyDraft());
              setItemSearch('');
            }}
            disabled={pending || candidates.length < 2}
            title={
              candidates.length < 2
                ? 'Você precisa de pelo menos 2 produtos cadastrados para montar um combo'
                : undefined
            }
          >
            + Novo combo
          </Button>
        )}
      </div>

      {combos.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎁"
            title="Nenhum combo montado"
            description={
              candidates.length < 2
                ? `Um combo junta produtos que já existem. Cadastre ao menos 2 itens no catálogo de ${businessTypeLabel} para montar o primeiro.`
                : 'Um combo junta produtos que você já vende, com um preço único. É a forma mais direta de aumentar o ticket sem cadastrar nada duas vezes.'
            }
            action={
              canManage && candidates.length >= 2 ? (
                <Button onClick={() => setDraft(emptyDraft())}>Montar o primeiro combo</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {combos.map((combo) => {
            const saving =
              combo.separateTotal > 0 ? combo.separateTotal - combo.price : 0;
            return (
              <Card key={combo.id} className="!p-4">
                <div className="flex items-start gap-3">
                  <ProductThumb
                    customImageUrl={combo.customImageUrl}
                    globalImageUrl={combo.globalImageUrl}
                    emoji={combo.emoji ?? '🎁'}
                    alt={combo.name}
                    size={56}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[0.9rem] font-bold text-ink-900">
                        {combo.name}
                      </span>
                      <Badge tone={combo.active ? 'green' : 'neutral'}>
                        {combo.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {!combo.available && <Badge tone="purple">Indisponível</Badge>}
                      {combo.featured && <Badge tone="yellow">★ Destaque</Badge>}
                    </div>

                    <p className="mt-1 text-[0.78rem] font-bold text-ink-800">
                      {formatBRL(combo.price)}
                      {combo.promotionalPrice != null && combo.promotionalPrice < combo.price && (
                        <span className="ml-2 font-semibold text-success">
                          promo {formatBRL(combo.promotionalPrice)}
                        </span>
                      )}
                    </p>

                    {/* Composição: o que o cliente recebe. */}
                    <ul className="mt-2 space-y-1">
                      {combo.items.map((item) => (
                        <li key={item.productId} className="text-[0.76rem] text-ink-600">
                          <span className="font-semibold">{item.quantity}×</span>{' '}
                          {item.emoji ? `${item.emoji} ` : ''}
                          {item.name}
                        </li>
                      ))}
                    </ul>

                    <p
                      className={cn(
                        'mt-2 text-[0.72rem]',
                        saving > 0 ? 'text-success' : 'text-ink-400',
                      )}
                    >
                      Vendido separado: {formatBRL(combo.separateTotal)}
                      {saving > 0
                        ? ` · o cliente economiza ${formatBRL(saving)}`
                        : saving < 0
                          ? ` · o combo custa ${formatBRL(Math.abs(saving))} a mais`
                          : ''}
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-ink-100 pt-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setDraft({
                          id: combo.id,
                          name: combo.name,
                          description: '',
                          imageUrl: '',
                          price: String(combo.price).replace('.', ','),
                          promotionalPrice:
                            combo.promotionalPrice != null
                              ? String(combo.promotionalPrice).replace('.', ',')
                              : '',
                          categoryId: combo.categoryId ?? '',
                          active: combo.active,
                          featured: combo.featured,
                          trackStock: false,
                          stock: '0',
                          items: combo.items.map((i) => ({
                            productId: i.productId,
                            quantity: i.quantity,
                          })),
                        })
                      }
                      className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirmDelete(combo)}
                      className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-danger transition-all hover:bg-danger-bg disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Editor ─────────────────────────────────────────────────── */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar combo' : 'Novo combo'}
        subtitle="Os itens são produtos do seu catálogo — nada é copiado."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={save}>
              {draft?.id ? 'Salvar combo' : 'Criar combo'}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field
              label="Nome do combo"
              required
              className="sm:col-span-2"
              error={fieldError === 'name' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                maxLength={120}
                placeholder="Ex.: Combo casal — 2 burgers + fritas + 2 refris"
              />
            </Field>

            <Field
              label="Preço do combo"
              required
              error={fieldError === 'price' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>

            <Field
              label="Preço promocional"
              hint="Opcional. Precisa ser menor que o preço do combo."
              error={fieldError === 'promotionalPrice' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.promotionalPrice}
                onChange={(e) => setDraft({ ...draft, promotionalPrice: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </Field>

            <Field label="Categoria" hint="Onde o combo aparece no cardápio.">
              <Select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.emoji ? `${category.emoji} ` : ''}
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Imagem do combo"
              hint="Opcional. Sem imagem, aparece o ícone de combo."
              error={fieldError === 'imageUrl' ? error ?? undefined : undefined}
            >
              <Input
                value={draft.imageUrl}
                onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                placeholder="https://…"
              />
            </Field>

            <Field label="Descrição" className="sm:col-span-2">
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={2}
                maxLength={500}
                placeholder="O que vem no combo, em uma linha."
              />
            </Field>

            <div className="sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="field-label !mb-0">
                  Itens do combo <span className="text-brand">*</span>
                </label>
                <span className="text-[0.76rem] text-ink-500">
                  {draft.items.length} escolhido{draft.items.length === 1 ? '' : 's'} · separado dá{' '}
                  <strong className="text-ink-700">{formatBRL(draftSeparateTotal)}</strong>
                </span>
              </div>

              {fieldError === 'items' && error && (
                <p className="mb-2 text-[0.74rem] font-medium text-danger">{error}</p>
              )}

              <Input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Buscar produto por nome ou categoria…"
                aria-label="Buscar produto para o combo"
                className="mb-2"
              />

              <div className="max-h-[260px] overflow-y-auto rounded border border-ink-200">
                {visibleCandidates.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[0.8rem] text-ink-400">
                    Nenhum produto encontrado com esse termo.
                  </p>
                ) : (
                  visibleCandidates.map((candidate) => {
                    const chosen = draft.items.find((i) => i.productId === candidate.id);
                    return (
                      <div
                        key={candidate.id}
                        className={cn(
                          'flex items-center gap-3 border-b border-ink-100 px-3.5 py-2.5 last:border-b-0',
                          chosen && 'bg-brand-light/30',
                        )}
                      >
                        <Checkbox
                          label=""
                          checked={Boolean(chosen)}
                          onChange={() => toggleItem(candidate.id)}
                          className="!gap-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.82rem] font-semibold text-ink-800">
                            {candidate.emoji ? `${candidate.emoji} ` : ''}
                            {candidate.name}
                          </span>
                          <span className="text-[0.72rem] text-ink-400">
                            {formatBRL(candidate.price)}
                          </span>
                        </span>

                        {chosen && (
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setQuantity(candidate.id, chosen.quantity - 1)}
                              className="h-7 w-7 rounded-sm border border-ink-200 text-[0.9rem] font-bold text-ink-600 transition-all hover:border-brand hover:text-brand"
                              aria-label={`Diminuir quantidade de ${candidate.name}`}
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-[0.84rem] font-bold text-ink-800">
                              {chosen.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQuantity(candidate.id, chosen.quantity + 1)}
                              className="h-7 w-7 rounded-sm border border-ink-200 text-[0.9rem] font-bold text-ink-600 transition-all hover:border-brand hover:text-brand"
                              aria-label={`Aumentar quantidade de ${candidate.name}`}
                            >
                              +
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <p className="mt-1.5 text-[0.72rem] text-ink-400">
                Combos não entram como item de outro combo. Precisa de pelo menos 2 produtos.
              </p>
            </div>

            <div className="mt-3 space-y-2.5 sm:col-span-2">
              <Checkbox
                label="Ativo no cardápio"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              <Checkbox
                label="Destacar no topo da loja"
                checked={draft.featured}
                onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
              />
              <Checkbox
                label="Controlar estoque deste combo"
                checked={draft.trackStock}
                onChange={(e) => setDraft({ ...draft, trackStock: e.target.checked })}
              />
              {draft.trackStock && (
                <Field label="Quantos combos disponíveis" className="!mb-0 max-w-[200px]">
                  <Input
                    value={draft.stock}
                    onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                    inputMode="numeric"
                  />
                </Field>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirmação de exclusão ────────────────────────────────── */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir combo"
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
                const combo = confirmDelete;
                if (!combo) return;
                run(
                  () => deleteComboAction(combo.id),
                  () => setConfirmDelete(null),
                );
              }}
            >
              Excluir combo
            </Button>
          </>
        }
      >
        <p className="text-[0.84rem] leading-relaxed text-ink-700">
          O combo <strong>{confirmDelete?.name}</strong> sai do cardápio. Os{' '}
          {confirmDelete?.items.length ?? 0} produtos que fazem parte dele{' '}
          <strong>continuam no seu catálogo</strong>, com preço e estoque intactos.
        </p>
      </Modal>
    </div>
  );
}

/**
 * "29,90" → 29.9 antes de sair da tela.
 *
 * O `moneyInputSchema` do servidor também aceita string no formato BR, mas
 * converter aqui evita que um "1.234,56" chegue como texto e vire 123456
 * por engano de interpretação — e o lojista veria o preço 1000× maior.
 */
function parseMoney(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}
