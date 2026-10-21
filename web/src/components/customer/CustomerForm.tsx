'use client';
import { useActionState,useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye,EyeOff } from 'lucide-react';
import { customerPortalAction } from '@/app/actions/customer-portal';
export function CustomerForm({slug,action,children,submit='Salvar'}:{slug:string;action:string;children?:React.ReactNode;submit?:string}){
  const [state,formAction,pending]=useActionState(customerPortalAction,undefined);const router=useRouter();
  useEffect(()=>{if(state?.ok){window.dispatchEvent(new CustomEvent('customer-session-changed',{detail:slug}));if(state.redirect)router.push(state.redirect);router.refresh();}},[state,router,slug]);
  return <form action={formAction} className="customer-form grid gap-3"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="action" value={action}/>{children}{state&&<p role={state.ok?'status':'alert'} className={state.ok?'customer-success':'customer-error'}>{state.message}</p>}<button type="submit" disabled={pending} className="customer-primary min-h-11 rounded-xl px-4 py-3 font-semibold text-white" style={{backgroundColor:'var(--customer-brand, var(--brand, #087EA4))'}}>{pending?'Aguarde…':submit}</button></form>;
}
export function CustomerPassword({name='password',label='Senha',required=true,current=false}:{name?:string;label?:string;required?:boolean;current?:boolean}){
 const [show,setShow]=useState(false);return <label>{label}<span className="customer-password"><input name={name} type={show?'text':'password'} required={required} minLength={name==='currentPassword'?undefined:8} maxLength={72} autoComplete={current||name==='currentPassword'?'current-password':'new-password'}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Ocultar senha':'Mostrar senha'}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>;
}
export function CustomerConfirmation({slug}:{slug:string}){
 const [data,setData]=useState<{token:string;reset:boolean}|null>(null);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1));setData({token:params.get('token')??'',reset:params.get('acao')==='RESET'});window.history.replaceState(null,'',window.location.pathname);},[]);
 if(!data)return <p role="status">Preparando confirmação…</p>;
 if(!data.token)return <p>Abra o link recebido por e-mail para confirmar sua solicitação.</p>;
 return <CustomerForm slug={slug} action="confirm" submit={data.reset?'Definir nova senha':'Confirmar solicitação'}><input type="hidden" name="token" value={data.token}/>{data.reset&&<><CustomerPassword/><CustomerPassword name="confirmPassword" label="Confirme a senha"/></>}</CustomerForm>;
}
