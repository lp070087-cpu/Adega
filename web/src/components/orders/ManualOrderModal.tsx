'use client';

import { useRef, useState } from 'react';
import { createManualOrderAction } from '@/app/actions/orders';
import { Alert, Button, Modal } from '@/components/ui';
import { formatBRL } from '@/lib/utils';

export type ManualProduct = {
  id: string; name: string; price: number;
  variations: Array<{ id: string; name: string; priceAdjustment: number }>;
  addonGroups: Array<{ id: string; name: string; required: boolean; minSelections: number; maxSelections: number;
    addons: Array<{ id: string; name: string; price: number }> }>;
};
type Line = { key: string; productId: string; quantity: number; variationId?: string; addonIds: string[] };

export function ManualOrderModal({ products, onCreated }: { products: ManualProduct[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState(products[0]?.id ?? '');
  const [deliveryType, setDeliveryType] = useState('PICKUP');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const requestKey = useRef<string | null>(null);
  const locked = useRef(false);
  const field = 'field-input w-full';
  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }
  async function submit(formData: FormData) {
    if (locked.current) return;
    if (!lines.length) { setError('Adicione pelo menos um produto.'); return; }
    locked.current = true; setPending(true); setError(null);
    requestKey.current ??= crypto.randomUUID();
    formData.set('idempotencyKey', requestKey.current);
    formData.set('items', JSON.stringify(lines.map(({ productId, quantity, variationId, addonIds }) => ({ productId, quantity, variationId, addonIds }))));
    try {
      const result = await createManualOrderAction(formData);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false); setLines([]); requestKey.current = null; onCreated();
    } catch { setError('Não foi possível confirmar o pedido. Tente novamente.'); }
    finally { locked.current = false; setPending(false); }
  }
  return <>
    <Button onClick={() => { setError(null); setOpen(true); }}>Novo pedido</Button>
    <Modal open={open} onClose={() => { if (!pending) setOpen(false); }} title="Novo pedido" subtitle="Preços e disponibilidade são conferidos no servidor." size="lg">
      <form action={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Nome do cliente<input name="customerName" required minLength={2} maxLength={120} className={field} autoComplete="name" /></label>
          <label>Telefone do cliente<input name="customerPhone" required type="tel" className={field} autoComplete="tel" placeholder="DDD + número" /></label>
          <label>Origem<select name="source" className={field}><option value="COUNTER">Balcão</option><option value="WHATSAPP">WhatsApp</option><option value="MANUAL">Outro atendimento</option></select></label>
          <label>Modalidade<select name="deliveryType" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)} className={field}><option value="PICKUP">Retirada</option><option value="DELIVERY">Entrega</option></select></label>
        </div>
        {deliveryType === 'DELIVERY' && <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">Endereço<input name="deliveryAddress" required minLength={5} maxLength={200} className={field} /></label>
          <label>Número<input name="deliveryNumber" required maxLength={20} className={field} /></label>
          <label>Bairro<input name="deliveryDistrict" required maxLength={120} className={field} /></label>
        </div>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">Produto<select value={selected} onChange={(e) => setSelected(e.target.value)} className={field}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
          </select></label>
          <Button type="button" disabled={!selected || pending || lines.length >= 80} onClick={() => {
            const product = products.find((p) => p.id === selected);
            if (product) setLines((current) => [...current, { key: crypto.randomUUID(), productId: product.id, quantity: 1, variationId: product.variations[0]?.id, addonIds: [] }]);
          }}>Adicionar</Button>
        </div>
        {!products.length && <p className="text-sm text-ink-500">Cadastre e disponibilize produtos no catálogo para lançar pedidos.</p>}
        {lines.map((line) => {
          const product = products.find((p) => p.id === line.productId)!;
          return <fieldset key={line.key} disabled={pending} className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 font-semibold">{product.name}</legend>
            <div className="flex items-end gap-3">
              <label>Quantidade<input type="number" required min={1} max={99} value={line.quantity} onChange={(e) => update(line.key, { quantity: Number(e.target.value) })} className={field} /></label>
              <Button type="button" variant="ghost" onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}>Remover</Button>
            </div>
            {!!product.variations.length && <label className="block">Variação<select value={line.variationId} onChange={(e) => update(line.key, { variationId: e.target.value })} className={field}>
              {product.variations.map((v) => <option key={v.id} value={v.id}>{v.name} ({formatBRL(v.priceAdjustment)})</option>)}
            </select></label>}
            {product.addonGroups.map((group) => <div key={group.id} className="space-y-2">
              <p className="text-sm font-semibold">{group.name} {group.required ? `(mínimo ${group.minSelections})` : '(opcional)'} · máximo {group.maxSelections}</p>
              {group.addons.map((addon) => <label key={addon.id} className="mr-4 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={line.addonIds.includes(addon.id)} onChange={(e) => update(line.key, { addonIds: e.target.checked ? [...line.addonIds, addon.id] : line.addonIds.filter((id) => id !== addon.id) })} />
                {addon.name} (+{formatBRL(addon.price)})
              </label>)}
            </div>)}
          </fieldset>;
        })}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Pagamento<select name="paymentMethod" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={field}>
            <option value="CASH">Dinheiro</option><option value="PIX">PIX na entrega/retirada</option><option value="CREDIT_CARD">Cartão de crédito</option><option value="DEBIT_CARD">Cartão de débito</option>
          </select></label>
          {paymentMethod === 'CASH' && <label>Troco para (opcional)<input type="number" step="0.01" min={0} name="changeFor" className={field} /></label>}
        </div>
        <label className="block">Observações<textarea name="notes" maxLength={300} className={field} /></label>
        <p className="text-sm text-ink-500">O pedido ficará em Novo para confirmação. O frete segue as regras cadastradas na loja.</p>
        <Button type="submit" disabled={pending || !lines.length}>{pending ? 'Registrando…' : 'Registrar pedido'}</Button>
      </form>
    </Modal>
  </>;
}
