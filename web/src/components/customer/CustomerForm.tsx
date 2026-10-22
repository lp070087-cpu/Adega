'use client';
import { startTransition,useActionState,useEffect,useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye,EyeOff,Loader2 } from 'lucide-react';
import { customerPortalAction } from '@/app/actions/customer-portal';
import { formatBrazilPhone } from '@/lib/customer-portal/policy';
export function CustomerForm({slug,action,children,submit='Salvar',pendingLabel='Aguarde…'}:{slug:string;action:string;children?:React.ReactNode;submit?:string;pendingLabel?:string}){
  const [state,formAction,pending]=useActionState(customerPortalAction,undefined);const router=useRouter();const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{if(state?.ok){window.dispatchEvent(new CustomEvent('customer-session-changed',{detail:slug}));if(state.redirect)router.push(state.redirect);else router.refresh();}},[state,router,slug]);
  // Submitting through onSubmit (not the form action prop) keeps what the customer typed when the server rejects it.
  // Server-side validation names the field; focus it so keyboard and screen reader users land on the problem.
  useEffect(()=>{if(!form.current)return;for(const field of form.current.querySelectorAll('[aria-invalid="true"]'))field.removeAttribute('aria-invalid');if(state&&!state.ok&&state.field){const field=form.current.elements.namedItem(state.field);if(field instanceof HTMLElement){field.setAttribute('aria-invalid','true');field.focus();}}},[state]);
  return <form ref={form} onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>formAction(data));}} className="customer-form"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="action" value={action}/>{children}{state&&<p role={state.ok?'status':'alert'} className={state.ok?'customer-success':'customer-error'}>{state.message}</p>}<button type="submit" disabled={pending||Boolean(state?.ok&&state.redirect)} aria-busy={pending} className="customer-primary">{pending?<><Loader2 className="customer-spin" size={18} aria-hidden/>{pendingLabel}</>:submit}</button></form>;
}
export function CustomerPassword({name='password',label='Senha',required=true,current=false,hint,aside}:{name?:string;label?:string;required?:boolean;current?:boolean;hint?:string;aside?:React.ReactNode}){
 const [show,setShow]=useState(false);const id=`customer-${name}`;
 return <div className="customer-field"><span className="customer-label-row"><label htmlFor={id}>{label}</label>{aside}</span><span className="customer-password"><input id={id} name={name} type={show?'text':'password'} required={required} minLength={name==='currentPassword'||current?undefined:8} maxLength={72} autoComplete={current||name==='currentPassword'?'current-password':'new-password'} aria-describedby={hint?`${id}-hint`:undefined}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Ocultar senha':'Mostrar senha'} aria-pressed={show} aria-controls={id}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span>{hint&&<small id={`${id}-hint`} className="customer-hint">{hint}</small>}</div>;
}
export function CustomerPhoneInput({name='phone',label='Telefone/WhatsApp',required=true,defaultValue=''}:{name?:string;label?:string;required?:boolean;defaultValue?:string}){
 const [value,setValue]=useState(formatBrazilPhone(defaultValue));
 return <label>{label}<input name={name} type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(81) 99999-9999" required={required} maxLength={16} value={value} onChange={event=>setValue(formatBrazilPhone(event.target.value))}/></label>;
}
export function CustomerConfirmation({slug}:{slug:string}){
 const [data,setData]=useState<{token:string;reset:boolean}|null>(null);
 useEffect(()=>{const params=new URLSearchParams(window.location.hash.slice(1));setData({token:params.get('token')??'',reset:params.get('acao')==='RESET'});window.history.replaceState(null,'',window.location.pathname);},[]);
 if(!data)return <p role="status">Preparando confirmação…</p>;
 if(!data.token)return <p>Abra o link recebido por e-mail para confirmar sua solicitação.</p>;
 return <CustomerForm slug={slug} action="confirm" submit={data.reset?'Definir nova senha':'Confirmar solicitação'}><input type="hidden" name="token" value={data.token}/>{data.reset&&<><CustomerPassword label="Nova senha" hint="Mínimo de oito caracteres."/><CustomerPassword name="confirmPassword" label="Confirme a nova senha"/></>}</CustomerForm>;
}
