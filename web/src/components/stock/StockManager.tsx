'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatBRL, formatDateTime } from '@/lib/utils';
import { adjustStockAction, setStockAction } from '@/app/actions/catalog';
import { INVENTORY_MOVEMENT_LABEL } from '@/data/business-copy';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ESTOQUE
 * -----------------------------------------------------------------------
 * Duas abas, porque são duas perguntas diferentes:
 *
 *   Saldo      → "como está o estoque agora?"
 *   Movimentos → "por que o estoque está assim?"
 *
 * A segunda é o livro-razão. Nenhum saldo muda sem um movimento que o
 * explique — nem venda, nem cancelamento, nem ajuste manual. É isso que
 * permite responder "por que tem 3 e não 8?" sem chutar.
 *
 * Ajuste relativo (+10 / −3) e inventário (contagem absoluta) são ações
 * separadas de propósito: quem conta a prateleira não quer calcular
 * diferença de cabeça, e quem repõe não quer recontar tudo.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type StockProduct = {
  id: string;
  name: string;
  emoji: string | null;
  sku: string | null;
  categoryName: string | null;
  stock: number;
  minimumStock: number;
  cost: number | null;
  price: number;
  trackStock: boolean;
  active: boolean;
};

export type StockMovement = {
  id: string;
  type: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  createdAt: string;
  productName: string;
  productEmoji: string | null;
  userName: string | null;
};

export type StockSummary = {
  productCount: number;
  units: number;
  costValue: number;
  saleValue: number;
  lowStock: number;
  outOfStock: number;
};

type Adjustment = { product: StockProduct; mode: 'ADJUST' | 'SET' };

export function StockManager({
  products,
  movements,
  summary,
  canManage,
}: {
  products: StockProduct[];
  movements: StockMovement[];
  summary: StockSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'balance' | 'movements'>('balance');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);

  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [movementType, setMovementType] = useState('');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      if (product.categoryName) set.add(product.categoryName);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      if (onlyLow && product.stock > product.minimumStock) return false;
      if (categoryFilter && product.categoryName !== categoryFilter) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? '').toLowerCase().includes(term)
      );
    });
  }, [products, search, categoryFilter, onlyLow]);

  const filteredMovements = useMemo(() => {
    if (!movementType) return movements;
    return movements.filter((movement) => movement.type === movementType);
  }, [movements, movementType]);

  function parseQuantity(value: string): number {
    const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function submit() {
    if (!adjustment) return;
    setError(null);

    const quantity = parseQuantity(amount);
    if (quantity === 0) {
      setError('Informe uma quantidade diferente de zero.');
      return;
    }
    if (adjustment.mode === 'SET' && quantity < 0) {
      setError('O saldo do inventário não pode ser negativo.');
      return;
    }

    startTransition(async () => {
      // O saldo que a tela mostra é o do momento em que a página foi
      // renderizada. Quem decide o saldo final é o servidor, dentro da
      // transação — inclusive recusando uma saída maior que o estoque.
      const result =
        adjustment.mode === 'ADJUST'
          ? await adjustStockAction({
              productId: adjustment.product.id,
              quantity,
              reason: reason.trim() || undefined,
            })
          : await setStockAction({
              productId: adjustment.product.id,
              newStock: quantity,
              reason: reason.trim() || undefined,
            });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdjustment(null);
      setAmount('');
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && !adjustment && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <MetricStrip
        items={[
          { label: 'Itens controlados', value: String(summary.productCount) },
          { label: 'Unidades em estoque', value: String(summary.units) },
          { label: 'Valor de custo', value: formatBRL(summary.costValue), hint: 'capital parado' },
          { label: 'Valor de venda', value: formatBRL(summary.saleValue), hint: 'se tudo vender' },
        ]}
      />

      {(summary.outOfStock > 0 || summary.lowStock > 0) && (
        <Alert
          tone={summary.outOfStock > 0 ? 'warn' : 'info'}
          title={`${summary.outOfStock} sem estoque · ${summary.lowStock} no mínimo`}
        >
          Use o filtro “Só o que precisa repor” na aba Saldo para ver a lista.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'balance', label: 'Saldo', count: products.length },
          { value: 'movements', label: 'Movimentos', count: movements.length },
        ]}
      />

      {tab === 'balance' ? (
        <Card>
          <CardHeader
            title="Saldo por produto"
            subtitle="Clique em Ajustar para dar entrada, saída ou contar o inventário."
          />

          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou SKU…"
              className="max-w-xs"
              aria-label="Buscar produto"
            />
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="max-w-[200px]"
              aria-label="Filtrar por categoria"
            >
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <label className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-ink-600">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
              />
              Só o que precisa repor
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon="📦"
              title={products.length === 0 ? 'Nenhum produto com estoque controlado' : 'Nada encontrado'}
              description={
                products.length === 0
                  ? 'Produtos com “controlar estoque” ligado aparecem aqui. Cadastre no Catálogo.'
                  : 'Ajuste a busca ou os filtros para ver outros produtos.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-100 text-left">
                    <Th>Produto</Th>
                    <Th className="text-right">Saldo</Th>
                    <Th className="text-right">Mínimo</Th>
                    <Th className="text-right">Custo</Th>
                    <Th className="text-right">Venda</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const out = product.stock === 0;
                    const low = !out && product.stock <= product.minimumStock;

                    return (
                      <tr key={product.id} className="border-b border-ink-100 last:border-b-0">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            <span aria-hidden className="text-[1.1rem]">
                              {product.emoji ?? '📦'}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[0.84rem] font-semibold text-ink-800">
                                {product.name}
                              </p>
                              <p className="truncate text-[0.7rem] text-ink-400">
                                {[product.categoryName, product.sku ? `SKU ${product.sku}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                                {!product.active ? ' · inativo' : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <Badge tone={out ? 'red' : low ? 'yellow' : 'green'}>{product.stock}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-500">
                          {product.minimumStock}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                          {product.cost === null ? '—' : formatBRL(product.cost)}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[0.8rem] font-semibold text-ink-800">
                          {formatBRL(product.price)}
                        </td>
                        <td className="py-2.5 text-right">
                          {canManage ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setError(null);
                                  setAdjustment({ product, mode: 'ADJUST' });
                                  setAmount('');
                                  setReason('');
                                }}
                              >
                                Ajustar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setError(null);
                                  setAdjustment({ product, mode: 'SET' });
                                  setAmount(String(product.stock));
                                  setReason('');
                                }}
                              >
                                Contar
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[0.76rem] text-ink-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Movimentos de estoque"
            subtitle="Cada linha é um saldo que mudou e o motivo. Últimos 100 movimentos."
          />

          <div className="mb-4 max-w-[240px]">
            <Select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value)}
              aria-label="Filtrar por tipo de movimento"
            >
              <option value="">Todos os tipos</option>
              {Object.entries(INVENTORY_MOVEMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          {filteredMovements.length === 0 ? (
            <EmptyState
              icon="🧾"
              title="Nenhum movimento registrado"
              description="Entradas, saídas, vendas e ajustes aparecem aqui conforme acontecem."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-100 text-left">
                    <Th>Quando</Th>
                    <Th>Produto</Th>
                    <Th>Tipo</Th>
                    <Th className="text-right">Qtd.</Th>
                    <Th className="text-right">Saldo</Th>
                    <Th>Motivo</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((movement) => {
                    const negative = ['OUT', 'SALE'].includes(movement.type);
                    return (
                      <tr key={movement.id} className="border-b border-ink-100 last:border-b-0">
                        <td className="py-2.5 pr-4 text-[0.76rem] text-ink-500">
                          {formatDateTime(movement.createdAt)}
                          {movement.userName ? (
                            <span className="block text-[0.68rem] text-ink-400">
                              por {movement.userName}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="flex items-center gap-2">
                            <span aria-hidden>{movement.productEmoji ?? '📦'}</span>
                            <span className="truncate text-[0.82rem] text-ink-700">
                              {movement.productName}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            tone={
                              movement.type === 'SALE'
                                ? 'blue'
                                : movement.type === 'CANCELLATION'
                                  ? 'purple'
                                  : movement.type === 'IN'
                                    ? 'green'
                                    : movement.type === 'OUT'
                                      ? 'red'
                                      : 'yellow'
                            }
                          >
                            {INVENTORY_MOVEMENT_LABEL[movement.type] ?? movement.type}
                          </Badge>
                        </td>
                        <td
                          className={cn(
                            'py-2.5 pr-4 text-right text-[0.82rem] font-bold',
                            negative ? 'text-danger' : 'text-success',
                          )}
                        >
                          {negative ? '−' : '+'}
                          {movement.quantity}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-[0.76rem] text-ink-500">
                          {movement.previousStock} → {movement.newStock}
                        </td>
                        <td className="py-2.5 text-[0.78rem] text-ink-500">
                          {movement.reason ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={adjustment !== null}
        onClose={() => setAdjustment(null)}
        title={adjustment?.mode === 'SET' ? 'Contar inventário' : 'Ajustar estoque'}
        subtitle={adjustment?.product.name}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustment(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={submit}>
              {adjustment?.mode === 'SET' ? 'Gravar contagem' : 'Lançar ajuste'}
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="danger" className="mb-3.5">
            {error}
          </Alert>
        )}

        {adjustment && (
          <>
            <Alert tone="neutral" className="mb-3.5">
              {adjustment.mode === 'SET'
                ? `Saldo atual: ${adjustment.product.stock} un. Informe o total contado — a diferença vira um movimento de ajuste.`
                : `Saldo atual: ${adjustment.product.stock} un. Use positivo para entrada e negativo para saída.`}
            </Alert>

            <Field
              label={adjustment.mode === 'SET' ? 'Total contado' : 'Quantidade'}
              required
              hint={
                adjustment.mode === 'SET'
                  ? 'Contagem absoluta, não diferença.'
                  : 'Ex.: 12 para dar entrada, -3 para dar baixa.'
              }
            >
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                autoFocus
              />
            </Field>

            <Field
              label="Motivo"
              hint={
                adjustment.mode === 'SET'
                  ? 'Opcional. Sem motivo, fica “Ajuste de inventário”.'
                  : 'Ex.: compra de fornecedor, quebra, perda, uso interno.'
              }
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={200}
              />
            </Field>

            {adjustment.mode === 'SET' && (
              <p className="text-[0.74rem] text-ink-500">
                Novo saldo:{' '}
                <strong className="text-ink-800">
                  {Math.max(0, Math.round(parseQuantity(amount) || 0))} un.
                </strong>
              </p>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string }>;
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500',
        className,
      )}
    >
      {children}
    </th>
  );
}
