'use client';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { useEffect,useRef,useState } from 'react';
import { PIN_PRESET_EVENT, type PinPreset } from '@/components/store/DeliveryPinPicker';
import { CustomerForm } from './CustomerForm';
type Address={id:string;label:string|null;street:string;number:string;complement:string|null;district:string;city:string;state:string;zipCode:string;isDefault:boolean;latitude?:number|null;longitude?:number|null;reference?:string|null};
type CustomerInfo={enabled?:boolean;account:{firstName:string;email:string;phone:string|null}|null;addresses?:Address[];pointsEnabled?:boolean};
export function CustomerStoreAccess({slug}:{slug:string}){
 const [info,setInfo]=useState<CustomerInfo|null>(null),base=`/loja/${slug}/conta`;
 useEffect(()=>{const controller=new AbortController();const load=()=>fetch(`${base}/sessao`,{cache:'no-store',signal:controller.signal}).then(response=>response.ok?response.json():null).then(setInfo).catch(()=>{});void load();window.addEventListener('focus',load);window.addEventListener('customer-session-changed',load);return()=>{controller.abort();window.removeEventListener('focus',load);window.removeEventListener('customer-session-changed',load);};},[base]);
 // Until the platform activates customer accounts, do not advertise sign-in.
 if(!info||info.enabled===false)return null;
 if(!info.account)return <div className="flex shrink-0 items-center gap-2 text-xs font-semibold sm:text-sm"><Link href={`${base}/entrar`} aria-label="Entrar ou criar conta" className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-full px-2 hover:bg-ink-50"><UserRound size={18} aria-hidden/><span className="hidden sm:inline">Entrar</span></Link><Link href={`${base}/criar-conta`} className="hidden min-h-10 items-center rounded-full px-2 hover:bg-ink-50 sm:inline-flex">Criar conta</Link></div>;
 return <details className="relative shrink-0"><summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-full px-2 text-sm font-semibold"><UserRound size={18}/><span className="hidden max-w-24 truncate sm:inline">{info.account.firstName.split(' ')[0]}</span><span className="sr-only sm:hidden">Minha conta</span></summary><div className="fixed inset-x-3 top-16 z-[80] grid gap-1 rounded-2xl bg-white p-3 text-sm shadow-xl ring-1 ring-black/5 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-60">{[['','Minha conta'],['pedidos','Meus pedidos'],['enderecos','Meus endereços'],...(info.pointsEnabled?[['pontos','Programa de pontos']]:[])].map(([path,label])=><Link key={path} className="rounded-lg p-2 hover:bg-ink-50" href={`${base}${path?`/${path}`:''}`}>{label}</Link>)}<CustomerForm slug={slug} action="logout" submit="Sair"/></div></details>;
}
export function CustomerCheckoutAccess({slug}:{slug:string}){
 const [info,setInfo]=useState<CustomerInfo|null>(null),base=`/loja/${slug}/conta`;
 useEffect(()=>{const controller=new AbortController();fetch(`${base}/sessao`,{cache:'no-store',signal:controller.signal}).then(response=>response.ok?response.json():null).then(setInfo).catch(()=>{});return()=>controller.abort();},[base]);
 if(!info)return null;
 if(info.enabled===false)return <p className="rounded-xl bg-ink-50 p-3 text-sm text-ink-500">Compra sem cadastro: informe seus dados abaixo. Você recebe um link para acompanhar o pedido.</p>;
 if(!info?.account)return <section className="space-y-2 rounded-xl border border-ink-100 bg-ink-50 p-3 text-sm"><p className="font-semibold text-ink-800">Tem conta nesta loja?</p><p className="text-ink-500">Entre para usar endereços salvos e acompanhar o pedido no seu histórico. A sacola continua salva e você volta direto para cá.</p><div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-10 items-center rounded-lg px-3 bg-brand font-semibold text-white" href={`${base}/entrar?voltar=checkout`}>Entrar</Link><Link className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 bg-white px-3 font-semibold" href={`${base}/criar-conta?voltar=checkout`}>Criar conta</Link></div><p className="text-xs text-ink-500">Você também pode comprar sem login.</p></section>;
 return <CheckoutAddressChoice base={base} account={info.account} addresses={info.addresses??[]}/>;
}

/**
 * Cliente logado: dados preenchidos uma vez e reaproveitados. Escolhe entre o
 * endereço principal, outro endereço salvo ou um novo (com opção de salvar).
 * O ponto confirmado no mapa e a referência do endereço salvo vêm junto.
 */
function CheckoutAddressChoice({base,account,addresses}:{base:string;account:{firstName:string;phone:string|null};addresses:Address[]}){
 const root=useRef<HTMLElement>(null);
 const initial=addresses.find(a=>a.isDefault)??addresses[0]??null;
 const [selected,setSelected]=useState<string>(initial?.id??'new');
 function apply(choice:string){
  const form=root.current?.closest('form');if(!form)return;
  const address=addresses.find(a=>a.id===choice)??null;
  const set=(name:string,value:string,force=true)=>{const field=form.elements.namedItem(name);if((field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement)&&(force||!field.value))field.value=value;};
  set('customerName',account.firstName,false);set('customerPhone',account.phone??'',false);
  set('deliveryAddress',address?[address.street,address.complement].filter(Boolean).join(', '):'');
  set('deliveryNumber',address?.number??'');set('deliveryDistrict',address?.district??'');
  if(address)set('deliveryCity',address.city);
  set('deliveryReference',address?.reference??'');
  const point=address&&address.latitude!=null&&address.longitude!=null?{latitude:address.latitude,longitude:address.longitude}:null;
  window.dispatchEvent(new CustomEvent<PinPreset>(PIN_PRESET_EVENT,{detail:{point,label:address?`${address.street}, ${address.number}`:null}}));
 }
 // Aplica o endereço principal assim que os campos de entrega existem.
 useEffect(()=>{const t=window.setTimeout(()=>apply(selected),50);return()=>window.clearTimeout(t);},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const choose=(id:string)=>{setSelected(id);apply(id);};
 return <section ref={root} className="space-y-2.5 rounded-xl border border-ink-100 bg-ink-50 p-3 text-sm" data-testid="checkout-account">
  <div className="flex flex-wrap items-center justify-between gap-2"><p>Pedido na conta de <strong>{account.firstName}</strong>.</p><Link className="text-[0.78rem] font-semibold text-brand underline" href={`${base}/enderecos`}>Gerenciar endereços</Link></div>
  <fieldset className="space-y-1.5"><legend className="mb-1 text-[0.78rem] font-bold text-ink-700">Entregar em</legend>
   {addresses.map(address=><label key={address.id} className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-lg border border-ink-200 bg-white p-2.5 has-[:checked]:border-brand has-[:checked]:ring-1 has-[:checked]:ring-brand">
    <input type="radio" name="addressChoice" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={selected===address.id} onChange={()=>choose(address.id)}/>
    <span className="min-w-0"><span className="block font-semibold text-ink-900">{address.label||(address.isDefault?'Endereço principal':'Endereço salvo')}{address.isDefault&&address.label?' · principal':''}</span><span className="block text-[0.78rem] text-ink-600">{address.street}, {address.number} · {address.district}{address.latitude!=null?' · 📍 ponto marcado':''}</span></span>
   </label>)}
   <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-ink-300 bg-white p-2.5 has-[:checked]:border-brand">
    <input type="radio" name="addressChoice" className="h-4 w-4 accent-[var(--brand)]" checked={selected==='new'} onChange={()=>choose('new')}/>
    <span className="font-semibold text-ink-800">Adicionar novo endereço</span>
   </label>
  </fieldset>
  {selected==='new'&&<div className="space-y-1 rounded-lg bg-white p-2.5" data-testid="save-address-options">
   <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="saveAddress" defaultChecked className="h-4 w-4 accent-[var(--brand)]"/>Salvar este endereço na minha conta</label>
   <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="saveAsDefault" defaultChecked={addresses.length===0} className="h-4 w-4 accent-[var(--brand)]"/>Usar como endereço principal</label>
  </div>}
 </section>;
}
