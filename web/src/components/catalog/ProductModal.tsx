'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL } from '@/lib/utils';
import { createProductAction, updateProductAction } from '@/app/actions/catalog';
import { Alert, Button, Checkbox, Field, Input, Modal, MoneyInput, Select, Textarea } from '@/components/ui';
import type { ProductType } from '@prisma/client';

/**
 * Cadastro/edição de produto.
 *
 * O que o lojista digita em "R$" chega ao servidor como texto e é
 * convertido lá — o action já sabe ler "29,90". Aqui só montamos o
 * FormData; nenhum valor é calculado no cliente.
 *
 * Estoque NÃO se edita neste modal: mudar saldo é operação de estoque,
 * passa por InventoryMovement. Editar cadastro não movimenta estoque.
 */

export type EditableProduct = {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  imageUrl: string | null;
  emoji: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  promotionalPrice: number | null;
  cost: number | null;
  stock: number;
  minimumStock: number;
  trackStock: boolean;
  active: boolean;
  available: boolean;
  type: string;
  variations: Array<{ id: string; name: string; priceAdjustment: number; active: boolean }>;
  addonGroups: Array<{
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    required: boolean;
    addons: Array<{ id: string; name: string; price: number; active: boolean }>;
  }>;
};

type VariationDraft = { name: string; priceAdjustment: number };
type AddonDraft = { name: string; price: number };

export function ProductModal({
  open,
  onClose,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  product: EditableProduct | null;
  categories: Array<{ id: string; name: string; emoji: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [emoji, setEmoji] = useState(product?.emoji ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [promotionalPrice, setPromotionalPrice] = useState(
    product?.promotionalPrice != null ? String(product.promotionalPrice) : '',
  );
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : '');
  const [minimumStock, setMinimumStock] = useState(String(product?.minimumStock ?? 0));
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [active, setActive] = useState(product?.active ?? true);
  const [available, setAvailable] = useState(product?.available ?? true);
  const [type, setType] = useState<ProductType>((product?.type as ProductType) ?? 'SIMPLE');

  const [variations, setVariations] = useState<VariationDraft[]>(
    product?.variations.map((v) => ({ name: v.name, priceAdjustment: v.priceAdjustment })) ?? [],
  );
  const [addons, setAddons] = useState<AddonDraft[]>(
    product?.addonGroups.flatMap((g) => g.addons.map((a) => ({ name: a.name, price: a.price }))) ??
      [],
  );

  function submit() {
    setError(null);

    if (name.trim().length < 2) {
      setError({ message: 'Informe o nome do produto.', field: 'name' });
      return;
    }
    const priceNumber = Number(price.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError({ message: 'Informe um preço de venda válido.', field: 'price' });
      return;
    }
    if (type === 'VARIATION' && variations.length === 0) {
      setError({ message: 'Adicione ao menos uma variação.', field: 'variations' });
      return;
    }
    if (type === 'ADDONS' && addons.length === 0) {
      setError({ message: 'Adicione ao menos um adicional.', field: 'addonGroups' });
      return;
    }

    const formData = new FormData();
    formData.set('name', name.trim());
    formData.set('categoryId', categoryId);
    formData.set('description', description);
    formData.set('imageUrl', imageUrl);
    formData.set('emoji', emoji);
    formData.set('sku', sku);
    formData.set('price', price);
    formData.set('promotionalPrice', promotionalPrice);
    formData.set('cost', cost);
    // Produto novo começa com estoque 0: entrada de estoque é feita no
    // módulo Estoque, que registra o movimento.
    formData.set('stock', product ? String(product.stock) : '0');
    formData.set('minimumStock', minimumStock);
    formData.set('trackStock', trackStock ? 'on' : 'off');
    formData.set('active', active ? 'on' : 'off');
    formData.set('available', available ? 'on' : 'off');
    formData.set('type', type);

    formData.set(
      'variations',
      JSON.stringify(
        variations
          .filter((v) => v.name.trim())
          .map((v, i) => ({
            name: v.name.trim(),
            priceAdjustment: v.priceAdjustment,
            active: true,
            position: i,
          })),
      ),
    );

    formData.set(
      'addonGroups',
      type === 'ADDONS' && addons.filter((a) => a.name.trim()).length > 0
        ? JSON.stringify([
            {
              name: 'Adicionais',
              minSelections: 0,
              maxSelections: Math.max(1, addons.length),
              required: false,
              position: 0,
              addons: addons
                .filter((a) => a.name.trim())
                .map((a, i) => ({ name: a.name.trim(), price: a.price, active: true, position: i })),
            },
          ])
        : JSON.stringify([]),
    );

    startTransition(async () => {
      const result = product
        ? await updateProductAction(product.id, formData)
        : await createProductAction(formData);

      if (!result.ok) {
        setError({ message: result.error, field: result.field });
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Editar ${product.name}` : 'Novo produto'}
      subtitle={
        product
          ? 'Alterações de estoque são feitas no módulo Estoque.'
          : 'Cadastre o produto; a entrada de estoque vem depois.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            {product ? 'Salvar alterações' : 'Criar produto'}
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-4">
          {error.message}
        </Alert>
      )}

      <div className="grid gap-x-3 sm:grid-cols-[80px_1fr]">
        <Field label="Emoji" hint="Aparece na vitrine.">
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            placeholder="🍔"
            className="text-center text-[1.2rem]"
          />
        </Field>

        <Field
          label="Nome do produto"
          required
          error={error?.field === 'name' ? error.message : undefined}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: X-Burger Especial"
            maxLength={160}
            autoFocus
          />
        </Field>
      </div>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Categoria">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.emoji ? `${category.emoji} ` : ''}
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tipo de produto" hint="Define se há tamanhos ou adicionais.">
          <Select value={type} onChange={(e) => setType(e.target.value as ProductType)}>
            <option value="SIMPLE">Simples</option>
            <option value="VARIATION">Com variações (tamanhos)</option>
            <option value="ADDONS">Com adicionais</option>
          </Select>
        </Field>
      </div>

      <Field label="Descrição">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Ingredientes, porção, observações..."
        />
      </Field>

      {/* ── Preços ─────────────────────────────────────────────────── */}
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Preço de venda" required error={error?.field === 'price' ? error.message : undefined}>
          <MoneyInput
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field
          label="Preço promocional"
          hint="Opcional. Deve ser menor que o preço cheio."
          error={error?.field === 'promotionalPrice' ? error.message : undefined}
        >
          <MoneyInput
            value={promotionalPrice}
            onChange={(e) => setPromotionalPrice(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label="Custo" hint="Usado no valor do estoque.">
          <MoneyInput value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
        </Field>
      </div>

      {/* ── Variações ──────────────────────────────────────────────── */}
      {type === 'VARIATION' && (
        <div className="mb-3.5 rounded border border-ink-100 p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[0.8rem] font-bold text-ink-700">Variações</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setVariations([...variations, { name: '', priceAdjustment: 0 }])}
            >
              + Adicionar
            </Button>
          </div>

          {variations.length === 0 ? (
            <p className="text-[0.78rem] text-ink-400">
              Ex.: Pequena (0), Média (+5), Grande (+9).
            </p>
          ) : (
            <ul className="space-y-2">
              {variations.map((variation, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    value={variation.name}
                    onChange={(e) => {
                      const next = [...variations];
                      next[index] = { ...variation, name: e.target.value };
                      setVariations(next);
                    }}
                    placeholder="Nome (ex.: Grande)"
                    className="flex-1"
                  />
                  <div className="w-[120px]">
                    <MoneyInput
                      value={String(variation.priceAdjustment)}
                      onChange={(e) => {
                        const next = [...variations];
                        next[index] = {
                          ...variation,
                          priceAdjustment: Number(e.target.value.replace(',', '.')) || 0,
                        };
                        setVariations(next);
                      }}
                      placeholder="+0,00"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remover variação"
                    onClick={() => setVariations(variations.filter((_, i) => i !== index))}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm text-ink-400 transition-all hover:bg-danger-bg hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error?.field === 'variations' && (
            <p className="mt-2 text-[0.72rem] font-medium text-danger">{error.message}</p>
          )}
        </div>
      )}

      {/* ── Adicionais ─────────────────────────────────────────────── */}
      {type === 'ADDONS' && (
        <div className="mb-3.5 rounded border border-ink-100 p-3.5">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[0.8rem] font-bold text-ink-700">Adicionais</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAddons([...addons, { name: '', price: 0 }])}
            >
              + Adicionar
            </Button>
          </div>

          {addons.length === 0 ? (
            <p className="text-[0.78rem] text-ink-400">
              Ex.: Bacon (+4), Cheddar (+3), Ovo (+2).
            </p>
          ) : (
            <ul className="space-y-2">
              {addons.map((addon, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    value={addon.name}
                    onChange={(e) => {
                      const next = [...addons];
                      next[index] = { ...addon, name: e.target.value };
                      setAddons(next);
                    }}
                    placeholder="Nome (ex.: Bacon)"
                    className="flex-1"
                  />
                  <div className="w-[120px]">
                    <MoneyInput
                      value={String(addon.price)}
                      onChange={(e) => {
                        const next = [...addons];
                        next[index] = { ...addon, price: Number(e.target.value.replace(',', '.')) || 0 };
                        setAddons(next);
                      }}
                      placeholder="0,00"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remover adicional"
                    onClick={() => setAddons(addons.filter((_, i) => i !== index))}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm text-ink-400 transition-all hover:bg-danger-bg hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error?.field === 'addonGroups' && (
            <p className="mt-2 text-[0.72rem] font-medium text-danger">{error.message}</p>
          )}
        </div>
      )}

      {/* ── Códigos e estoque ──────────────────────────────────────── */}
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="SKU" hint="Código interno.">
          <Input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Estoque mínimo" hint="Alerta de reposição.">
          <Input
            value={minimumStock}
            onChange={(e) => setMinimumStock(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Imagem" hint="URL pública da foto.">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-5 rounded border border-ink-100 bg-ink-50 px-3.5 py-3">
        <Checkbox
          label="Controlar estoque"
          checked={trackStock}
          onChange={(e) => setTrackStock(e.target.checked)}
        />
        <Checkbox
          label="Ativo (aparece na vitrine)"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        <Checkbox
          label="Disponível agora"
          checked={available}
          onChange={(e) => setAvailable(e.target.checked)}
        />
      </div>

      <p className="mt-2 text-[0.72rem] leading-relaxed text-ink-400">
        A vitrine mostra o produto quando ele está <strong>ativo</strong>,{' '}
        <strong>disponível</strong> e — com estoque controlado — <strong>com saldo</strong>.
        Marcar como destaque (★) é feito na lista de produtos e só define a posição no topo.
      </p>

      {product && (
        <p className="mt-3 text-[0.72rem] text-ink-400">
          Estoque atual: <strong className="text-ink-600">{product.stock} un.</strong> · Vendendo
          por{' '}
          <strong className="text-ink-600">
            {formatBRL(
              product.promotionalPrice != null && product.promotionalPrice < product.price
                ? product.promotionalPrice
                : product.price,
            )}
          </strong>
          {product.promotionalPrice != null && product.promotionalPrice < product.price && (
            <> (promoção, de {formatBRL(product.price)})</>
          )}
        </p>
      )}
    </Modal>
  );
}
