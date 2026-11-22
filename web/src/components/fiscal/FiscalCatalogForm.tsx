'use client';

import { useActionState, useState } from 'react';
import { saveProductFiscalAction } from '@/app/actions/fiscal';
import { FISCAL_ICMS_CODES, FISCAL_CONTRIBUTION_CODES, type ProductFiscal } from '@/lib/fiscal';

export type FiscalCatalogProduct = { id: string; name: string; fiscal: ProductFiscal | null };

export function FiscalCatalogForm({ products }: { products: FiscalCatalogProduct[] }) {
  const [productId, setProductId] = useState('');
  const selected = products.find((product) => product.id === productId);
  if (!products.length) return <p className="text-sm text-ink-600">Cadastre um produto no catálogo para configurar sua tributação.</p>;
  return (
    <div className="space-y-3">
      <label className="block"><span className="field-label">Produto</span>
        <select value={productId} onChange={(event) => setProductId(event.target.value)} className="field-input">
          <option value="">Selecione um produto</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.fiscal ? ' · cadastrado' : ''}</option>)}
        </select>
      </label>
      {selected && <ProductFields key={selected.id} product={selected} />}
    </div>
  );
}

function ProductFields({ product }: { product: FiscalCatalogProduct }) {
  const [state, action, pending] = useActionState(saveProductFiscalAction, null);
  const fiscal = product.fiscal;
  const [values, setValues] = useState({
    ncm: fiscal?.ncm ?? '', cest: fiscal?.cest ?? '', cfop: fiscal?.cfop ?? '', unit: fiscal?.unit ?? '',
    origin: fiscal?.origin ?? '', icmsCode: fiscal?.icmsCode ?? '', pisCode: fiscal?.pisCode ?? '',
    cofinsCode: fiscal?.cofinsCode ?? '', icmsRate: String(fiscal?.icmsRate ?? ''),
    pisRate: String(fiscal?.pisRate ?? ''), cofinsRate: String(fiscal?.cofinsRate ?? ''),
  });
  const change = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="productId" value={product.id} />
      {([['ncm', 'NCM', 10], ['cest', 'CEST, quando aplicável', 9], ['cfop', 'CFOP interno', 4], ['unit', 'Unidade comercial', 6]] as const).map(([name, label, length]) => (
        <label key={name}><span className="field-label">{label}</span><input name={name} value={values[name]} onChange={change(name)} required={name !== 'cest'} maxLength={length} className="field-input" /></label>
      ))}
      <label><span className="field-label">Origem da mercadoria</span>
        <select name="origin" value={values.origin} onChange={change('origin')} required className="field-input">
          <option value="">Selecione</option>
          <option value="0">0 · Nacional</option>
          <option value="1">1 · Importação direta</option>
          <option value="2">2 · Estrangeira adquirida no mercado interno</option>
          {['3', '4', '5', '6', '7', '8'].map((code) => <option key={code}>{code}</option>)}
        </select>
      </label>
      {([
        ['icmsCode', 'ICMS · CST ou CSOSN', FISCAL_ICMS_CODES, 'icmsRate', 'Alíquota ICMS (%)'],
        ['pisCode', 'CST de PIS', FISCAL_CONTRIBUTION_CODES, 'pisRate', 'Alíquota PIS (%)'],
        ['cofinsCode', 'CST de COFINS', FISCAL_CONTRIBUTION_CODES, 'cofinsRate', 'Alíquota COFINS (%)'],
      ] as const).map(([name, label, codes, rate, rateLabel]) => (
        <div key={name} className="contents">
          <label><span className="field-label">{label}</span>
            <select name={name} value={values[name]} onChange={change(name)} required className="field-input">
              <option value="">Selecione</option>
              {codes.map((code) => <option key={code}>{code}</option>)}
            </select>
          </label>
          <label><span className="field-label">{rateLabel}</span><input name={rate} value={values[rate]} onChange={change(rate)} inputMode="decimal" maxLength={8} className="field-input" /></label>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar tributação do produto'}</button>
        {state && <p role="status" className={state.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{state.message}</p>}
      </div>
    </form>
  );
}
