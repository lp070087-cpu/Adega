'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { stockPublicationAction } from '@/app/actions/stock-publication';
import { Alert, Button, Card, Field, Input, Modal } from '@/components/ui';
import { formatBRL, normalizeSearchText } from '@/lib/utils';
import { MAX_CATALOG_SELECTION } from '@/lib/stock-policy';
import type { StockPublicationChange } from '@/lib/stock-publication';

type Change = StockPublicationChange;
type Product = Change & { name: string; price: number };
type Preview = {
  organization: { name: string };
  digest: string;
  rows: Array<{ id: string; name: string; previous: Omit<Change, 'id'>; proposed: Change; excluded: string | null }>;
};
type Mode = 'PUBLISH' | 'INITIALIZE';

function publishable(product: Product) {
  return product.price > 0 && (!product.trackStock || product.stock > 0);
}

function proposed(product: Product, mode: Mode): Change {
  const { id, stock, minimumStock, trackStock } = product;
  return mode === 'INITIALIZE'
    ? { id, stock: 25, minimumStock: 5, active: true, available: true, trackStock: true }
    : { id, stock, minimumStock, active: true, available: true, trackStock };
}

export function StockPublication({ products, canInitialize }: { products: Product[]; canInitialize: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [approved, setApproved] = useState(false);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [search, setSearch] = useState('');

  const visible = products.filter((product) => normalizeSearchText(product.name).includes(normalizeSearchText(search)));
  const eligible = products.filter((product) => mode === 'INITIALIZE' || (!product.active && publishable(product)));
  const selectedIds = new Set(selected);
  const excess = eligible.length > MAX_CATALOG_SELECTION;

  function begin(next: Mode) {
    setMode(next);
    setPreview(null);
    setMessage('');
    setSelected([]);
    setChanges({});
    setSearch('');
    setApproved(false);
    setReason('');
    setRequestId(crypto.randomUUID());
  }

  function update(product: Product, change: Partial<Change>) {
    setChanges((current) => ({
      ...current,
      [product.id]: { ...(current[product.id] ?? proposed(product, 'PUBLISH')), ...change },
    }));
  }

  function submit(confirm = false) {
    if (!mode) return;
    const note = reason.trim() || (mode === 'INITIALIZE'
      ? 'Inicialização de estoque pelo painel (25/5)'
      : 'Publicação conferida pelo painel de estoque');
    if (note.length < 10) {
      setMessage('Escreva pelo menos 10 caracteres na observação ou deixe-a vazia.');
      return;
    }
    const requested = products.filter(({ id }) => selectedIds.has(id))
      .map((product) => changes[product.id] ?? proposed(product, mode));
    if (!requested.length) return;
    start(async () => {
      const result = await stockPublicationAction({
        mode, requestId, changes: requested, reason: note, confirm,
        previewDigest: confirm ? preview?.digest : undefined,
      }).catch(() => ({ ok: false as const, error: 'Sem resposta do servidor. Atualize a página e tente novamente.' }));
      if (!result.ok) {
        setMessage(result.error);
        if (confirm) {
          setPreview(null);
          setApproved(false);
        }
        return;
      }
      if (confirm || result.data.repeated) {
        setMode(null);
        setMessage(`${result.data.changed} produtos ${mode === 'INITIALIZE' ? 'registrados' : 'publicados'}.`);
        router.refresh();
      } else {
        setPreview(result.data);
        setApproved(false);
        setMessage('');
      }
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Publicação na vitrine</h3>
          <p className="text-sm text-ink-500">Selecione os itens do estoque que quer mostrar em Produtos e na loja pública.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!products.length} onClick={() => begin('PUBLISH')}>Publicar na vitrine</Button>
          {canInitialize && <Button variant="secondary" disabled={!products.length} onClick={() => begin('INITIALIZE')}>Inicializar estoques · prévia 25/5</Button>}
        </div>
      </div>
      {message && !mode && <Alert className="mt-3">{message}</Alert>}
      <Modal open={Boolean(mode)} onClose={() => !pending && setMode(null)} title={mode === 'INITIALIZE' ? 'Inicializar estoques · 25 unidades / mínimo 5' : 'Publicar na vitrine'} size="lg">
        {message && <Alert className="mb-3">{message}</Alert>}
        {!preview ? (
          <>
            <p className="mb-4 text-sm text-ink-600">
              {mode === 'INITIALIZE'
                ? 'O lote propõe 25 unidades, mínimo 5 e publicação dos itens escolhidos. Confira se os saldos propostos correspondem à contagem física.'
                : 'Selecione os itens individualmente ou use “Selecionar todos prontos”. Produtos ainda sem saldo podem ser selecionados para informar a quantidade antes de revisar.'}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Buscar no estoque"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
              <Field label="Observação (opcional)"><Input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" disabled={pending || !eligible.length} onClick={() => setSelected(eligible.slice(0, MAX_CATALOG_SELECTION).map(({ id }) => id))}>
                {excess ? `Selecionar primeiros ${MAX_CATALOG_SELECTION} prontos` : mode === 'INITIALIZE' ? 'Selecionar todos' : 'Selecionar todos prontos'} ({eligible.length})
              </Button>
              <Button variant="ghost" disabled={pending || !selected.length} onClick={() => setSelected([])}>Limpar seleção</Button>
              <span className="text-xs text-ink-500">{selected.length} selecionados</span>
            </div>
            <ul className="my-3 max-h-[45vh] space-y-2 overflow-auto">
              {visible.map((product) => {
                const checked = selectedIds.has(product.id);
                const value = changes[product.id] ?? proposed(product, 'PUBLISH');
                return (
                  <li key={product.id} className="rounded-lg bg-ink-50 p-3">
                    <label className="flex items-start gap-2 text-sm font-medium">
                      <input type="checkbox" checked={checked} disabled={pending || (!checked && selected.length >= MAX_CATALOG_SELECTION)} onChange={(event) =>
                        setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))} />
                      <span>
                        {product.name}
                        <small className="block font-normal text-ink-500">
                          {product.active ? 'Publicado' : 'Somente no estoque'} · saldo {product.stock} · {product.price > 0 ? formatBRL(product.price) : 'Preço a definir no Estoque'}
                        </small>
                      </span>
                    </label>
                    {checked && mode === 'PUBLISH' && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <Field label="Saldo físico"><Input type="number" disabled={pending} min={0} max={999999} value={value.stock} onChange={(event) => update(product, { stock: Number(event.target.value) })} /></Field>
                        <Field label="Estoque mínimo"><Input type="number" disabled={pending} min={0} max={999999} value={value.minimumStock} onChange={(event) => update(product, { minimumStock: Number(event.target.value) })} /></Field>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="sticky bottom-0 border-t border-ink-100 bg-white py-2">
              <Button loading={pending} disabled={!selected.length} onClick={() => submit()}>Revisar alterações</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">{preview.organization.name}</p>
            <p className="text-sm text-ink-500">{preview.rows.filter(({ excluded }) => !excluded).length} elegíveis de {preview.rows.length} selecionados</p>
            <ul className="my-3 max-h-[45vh] space-y-2 overflow-auto">
              {preview.rows.map((row) => (
                <li key={row.id} className="rounded-lg bg-ink-50 p-3 text-sm">
                  <strong>{row.name}</strong>
                  {row.excluded ? <p className="text-amber-800">{row.excluded}</p>
                    : <p>Saldo {row.previous.stock} → {row.proposed.stock} · mínimo {row.previous.minimumStock} → {row.proposed.minimumStock}</p>}
                </li>
              ))}
            </ul>
            <div className="sticky bottom-0 space-y-2 border-t border-ink-100 bg-white py-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} />
                Conferi os preços e saldos antes de publicar.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button loading={pending} disabled={!approved || !preview.rows.some(({ excluded }) => !excluded)} onClick={() => submit(true)}>
                  {mode === 'INITIALIZE' ? 'Salvar estoque inicial' : 'Confirmar publicação'}
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => { setPreview(null); setApproved(false); }}>Voltar à seleção</Button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </Card>
  );
}
