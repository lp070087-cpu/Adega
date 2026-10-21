'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { stockPublicationAction } from '@/app/actions/stock-publication';
import { Alert, Button, Card, Field, Input, Modal } from '@/components/ui';

type Product = { id: string; name: string; stock: number; minimumStock: number; active: boolean; available: boolean; trackStock: boolean };
type Change = Omit<Product, 'name'>;
type Preview = { organization: { id: string; name: string }; digest: string; rows: Array<{ id: string; name: string; previous: Omit<Change,'id'>; proposed: Change; excluded: string | null }> };
export function StockPublication({ products, canInitialize }: { products: Product[]; canInitialize: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [pending, start] = useTransition();
  const [mode, setMode] = useState<'PUBLISH'|'INITIALIZE'>('PUBLISH');
  const [selected, setSelected] = useState<string[]>([]), [changes, setChanges] = useState<Record<string,Change>>({});
  const [preview, setPreview] = useState<Preview|null>(null), [reason, setReason] = useState(''), [approved, setApproved] = useState(false);
  const [message, setMessage] = useState(''), [requestId, setRequestId] = useState('');
  function begin(next: typeof mode) { setMode(next); setOpen(true); setPreview(null); setMessage(''); setSelected([]); setChanges({}); setApproved(false); setReason(''); setRequestId(crypto.randomUUID()); }
  function update(product: Product, change: Partial<Change>) { setChanges(value => {
    const previous = value[product.id] ?? { id:product.id, stock:product.stock, minimumStock:product.minimumStock, active:product.active, available:true, trackStock:product.trackStock };
    return {...value,[product.id]:{...previous,...change}};
  }); setPreview(null); setApproved(false); }
  function submit(confirm = false) {
    const requested = selected.map(id => {
      const product = products.find(row => row.id === id)!;
      return mode === 'INITIALIZE' ? { id, stock:25, minimumStock:5, active:true, available:true, trackStock:true } : changes[id] ?? { id, stock:product.stock, minimumStock:product.minimumStock, active:product.active, available:true, trackStock:product.trackStock };
    });
    start(async () => {
      const result = await stockPublicationAction({ mode, requestId, changes: requested, reason, confirm, previewDigest: confirm ? preview?.digest : undefined });
      if (!result.ok) { setMessage(result.error); if(confirm) {setPreview(null); setApproved(false);} return; }
      if (confirm || result.data.repeated) { setOpen(false); setMessage(`${result.data.changed} produtos registrados${result.data.repeated?' anteriormente; nenhum lançamento duplicado':''}.`); router.refresh(); }
      else { setPreview(result.data); setApproved(false); setMessage('Confira a loja, as quantidades e as exclusões antes de confirmar.'); }
    });
  }
  return <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Estoque e catálogo</h3><p className="text-sm text-ink-500">Publique produtos existentes, sem duplicar cadastros. O saldo físico é o mesmo usado na venda.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => begin('PUBLISH')}>Disponibilizar no catálogo</Button>{canInitialize && <Button variant="secondary" onClick={() => begin('INITIALIZE')}>Inicializar estoques · prévia 25/5</Button>}</div></div>{message && !open && <Alert className="mt-3">{message}</Alert>}
    <Modal open={open} onClose={() => !pending && setOpen(false)} title={mode === 'INITIALIZE'?'Inicialização conferida · 25 unidades / mínimo 5':'Disponibilizar no catálogo'} size="lg">
      <p className="mb-4 text-sm text-ink-600">{mode === 'INITIALIZE'?'O lote propõe 25 unidades, mínimo 5 e ativação dos produtos selecionados. Saldos existentes só mudam após a prévia e sua confirmação explícita.':'Escolha os produtos e confirme disponibilidade, controle e saldo físico. A quantidade informada é uma contagem de estoque, não uma cópia ou reserva separada.'} Combos e produtos em pedidos em andamento são preservados.</p>
      {message && <Alert className="mb-3">{message}</Alert>}
      {!preview ? <>
        <Field label="Motivo da conferência"><Input value={reason} minLength={10} maxLength={300} onChange={event => setReason(event.target.value)} placeholder="Ex.: contagem física conferida nesta data"/></Field>
        <div className="my-3 flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setSelected(products.slice(0,100).map(p=>p.id))}>Selecionar primeiros {Math.min(products.length,100)}</Button><Button variant="ghost" onClick={() => setSelected([])}>Limpar seleção</Button><span className="self-center text-xs text-ink-500">{selected.length}/100 por lote</span></div>
        <div className="my-4 max-h-[45vh] space-y-3 overflow-auto pr-1">{products.map(product => {
          const checked = selected.includes(product.id), value = {...product,...changes[product.id]};
          return <div key={product.id} className="rounded-lg bg-ink-50 p-3"><label className="flex items-start gap-2 text-sm font-medium"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 100} onChange={event=>setSelected(event.target.checked?[...selected,product.id]:selected.filter(id=>id!==product.id))}/><span className="min-w-0 break-words">{product.name}<small className="block font-normal text-ink-500">Saldo {product.stock} · mínimo {product.minimumStock} · {product.active?'Publicado':'Inativo'}</small></span></label>
          {checked && mode === 'PUBLISH' && <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Saldo físico conferido"><Input type="number" min={0} max={999999} value={value.stock} onChange={e=>update(product,{stock:Number(e.target.value)})}/></Field><Field label="Estoque mínimo"><Input type="number" min={0} max={999999} value={value.minimumStock} onChange={e=>update(product,{minimumStock:Number(e.target.value)})}/></Field><label className="flex gap-2 text-sm"><input type="checkbox" checked={value.active} onChange={e=>update(product,{active:e.target.checked})}/>Publicado</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={changes[product.id]?.available ?? true} onChange={e=>update(product,{available:e.target.checked})}/>Disponível</label><label className="col-span-2 flex gap-2 text-sm"><input type="checkbox" checked={value.trackStock} onChange={e=>update(product,{trackStock:e.target.checked})}/>Controlar estoque nas vendas</label>{!value.trackStock && <p className="col-span-2 text-xs text-amber-800">Sem controle, a venda não é limitada pelo saldo. Use somente para itens produzidos sob demanda.</p>}</div>}</div>;
        })}</div><Button loading={pending} disabled={!selected.length || reason.trim().length<10} onClick={()=>submit()}>Revisar alterações</Button>
      </> : <>
        <p className="font-semibold">{preview.organization.name}</p><p className="mb-3 text-xs text-ink-500">Organização: {preview.organization.id}</p><p className="text-sm">{preview.rows.length} selecionados · {preview.rows.filter(p=>!p.excluded).length} elegíveis · {preview.rows.filter(p=>p.excluded).length} preservados</p>
        <div className="my-4 max-h-[45vh] space-y-3 overflow-auto">{preview.rows.map(row=><div key={row.id} className="rounded-lg bg-ink-50 p-3 text-sm"><strong>{row.name}</strong>{row.excluded?<p className="text-amber-800">Preservado: {row.excluded}</p>:<><p>Saldo: {row.previous.stock} → {row.proposed.stock} · mínimo: {row.previous.minimumStock} → {row.proposed.minimumStock}</p><p>{row.previous.active?'Publicado':'Inativo'} → {row.proposed.active?'Publicado':'Inativo'} · {row.proposed.available?'Disponível':'Indisponível'} · {row.proposed.trackStock?'Venda limitada ao saldo':'Sem controle de saldo'}</p></>}</div>)}</div>
        <label className="mb-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)}/><span>Conferi os saldos físicos e autorizo explicitamente estas alterações somente nesta organização.</span></label><div className="flex flex-wrap gap-2"><Button loading={pending} disabled={!approved || !preview.rows.some(row=>!row.excluded)} onClick={()=>submit(true)}>Confirmar alterações conferidas</Button><Button variant="ghost" disabled={pending} onClick={()=>{setPreview(null);setApproved(false);}}>Voltar</Button></div>
      </>}
    </Modal>
  </Card>;
}
