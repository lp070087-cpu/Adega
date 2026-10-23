'use client';
import {startTransition,useActionState,useEffect,useRef,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {Button,Field,Input} from '@/components/ui';
import {requestDriverCodeAction,confirmDriverCodeAction,type DriverAccessState} from '@/app/actions/driver-access';

const initial:DriverAccessState={ok:false,message:''};

/**
 * Primeiro acesso e "esqueci minha senha" são o mesmo fluxo: e-mail cadastrado
 * pela loja → código de 6 dígitos enviado a esse e-mail → nova senha. O código
 * é digitado aqui mesmo, então funciona também no app instalado (PWA), onde um
 * link de e-mail abriria outro navegador.
 */
export function DriverAccessForm({mailReady,store,onBack}:{mailReady:boolean;store?:string;onBack:()=>void}){
 const [email,setEmail]=useState('');
 const [show,setShow]=useState(false);
 const [request,requestAction,requestPending]=useActionState(requestDriverCodeAction,initial);
 const [confirm,confirmAction,confirmPending]=useActionState(confirmDriverCodeAction,initial);
 const [step,setStep]=useState<'email'|'code'>('email');
 const [wait,setWait]=useState(0);
 const codeRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(request.ok&&request.step==='code'){setStep('code');setWait(60);}},[request]);
 useEffect(()=>{if(step==='code')codeRef.current?.focus();},[step]);
 useEffect(()=>{if(wait<=0)return;const id=setTimeout(()=>setWait(wait-1),1000);return ()=>clearTimeout(id);},[wait]);
 useEffect(()=>{if(confirm.ok&&confirm.step==='email')onBack();},[confirm,onBack]);
 const submit=(action:(data:FormData)=>void)=>(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);startTransition(()=>action(data));};

 if(!mailReady)return <div className="mt-6 space-y-4 text-left">
  <h2 className="text-lg font-bold text-ink-900">Primeiro acesso ou nova senha</h2>
  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Para sua segurança, a senha só pode ser criada depois de confirmar o seu e-mail com um código. O envio de e-mails ainda está sendo ativado pela plataforma. Quem já tem senha continua entrando normalmente.</p>
  <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Voltar para entrar</button>
 </div>;

 return <div className="mt-6 space-y-4 text-left">
  <h2 className="text-lg font-bold text-ink-900">{step==='email'?'Primeiro acesso ou nova senha':'Digite o código e crie sua senha'}</h2>
  {step==='email'?<>
   <p className="text-sm text-ink-500">Informe o mesmo e-mail que a loja cadastrou. Vamos enviar um código para confirmar que o e-mail é seu.</p>
   {request.message&&!request.ok&&<p role="alert" className="rounded-lg border border-danger/25 bg-danger-bg p-3 text-sm text-danger">{request.message}</p>}
   <form action={requestAction} onSubmit={submit(requestAction)} className="space-y-4">
    <Field label="E-mail cadastrado pela loja" required><Input name="email" aria-label="E-mail cadastrado pela loja" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></Field>
    <Button fullWidth size="lg" type="submit" loading={requestPending}>{requestPending?'Enviando…':'Enviar código'}</Button>
   </form>
  </>:<>
   <p role="status" className="rounded-lg bg-brand-light p-3 text-sm text-ink-700">{request.message}</p>
   {confirm.message&&!confirm.ok&&<p role="alert" className="rounded-lg border border-danger/25 bg-danger-bg p-3 text-sm text-danger">{confirm.message}</p>}
   <form action={confirmAction} onSubmit={submit(confirmAction)} className="space-y-4">
    <input type="hidden" name="email" value={email}/>
    {store&&<input type="hidden" name="store" value={store}/>}
    <Field label="Código recebido por e-mail" required><Input ref={codeRef} name="code" aria-label="Código recebido por e-mail" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required placeholder="000000" className="text-center font-mono text-xl tracking-[0.4em]"/></Field>
    <Field label="Crie sua senha" required hint="Mínimo de 8 caracteres."><div className="relative"><Input name="password" aria-label="Crie sua senha" type={show?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={72} className="pr-12"/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(!show)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></Field>
    <Field label="Confirme a senha" required><Input name="confirm" aria-label="Confirme a senha" type={show?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={72}/></Field>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="remember" defaultChecked className="h-5 w-5"/>Manter conectado neste aparelho</label>
    <Button fullWidth size="lg" type="submit" loading={confirmPending}>{confirmPending?'Confirmando…':'Confirmar e entrar'}</Button>
   </form>
   <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <button type="button" disabled={wait>0||requestPending} onClick={()=>{const data=new FormData();data.set('email',email);startTransition(()=>requestAction(data));}} className="inline-flex min-h-11 items-center font-semibold text-brand disabled:text-ink-400">{wait>0?`Reenviar código em ${wait}s`:'Reenviar código'}</button>
    <button type="button" onClick={()=>setStep('email')} className="inline-flex min-h-11 items-center font-semibold text-brand">Trocar e-mail</button>
   </div>
  </>}
  <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand">Voltar para entrar</button>
 </div>;
}
