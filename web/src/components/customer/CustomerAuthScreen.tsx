import Link from 'next/link';
import { ArrowLeft,MapPin,PackageCheck,ShieldCheck,ShoppingBag } from 'lucide-react';
import { CustomerForm,CustomerPassword,CustomerPhoneInput,CustomerConfirmation } from './CustomerForm';
import { PORTAL_MAIL_UNAVAILABLE } from '@/lib/customer-portal/server';

type Store={slug:string;name:string;logoUrl:string|null};
export type AuthSection='entrar'|'criar-conta'|'recuperar'|'confirmar';
const copy:Record<AuthSection,{title:string;subtitle:string}>={
 entrar:{title:'Entre na sua conta',subtitle:'Acompanhe pedidos, use endereços salvos e finalize compras mais rápido.'},
 'criar-conta':{title:'Crie sua conta',subtitle:'Leva menos de um minuto. Seus dados ficam restritos a esta loja.'},
 recuperar:{title:'Recuperar senha',subtitle:'Informe o e-mail da sua conta para receber um link de redefinição.'},
 confirmar:{title:'Confirmar solicitação',subtitle:'Conclua a confirmação enviada para o seu e-mail.'},
};
const benefits=[[PackageCheck,'Acompanhe cada etapa do pedido'],[MapPin,'Endereços salvos para a entrega'],[ShoppingBag,'Sua sacola continua salva neste aparelho'],[ShieldCheck,'Senha protegida e dados só desta loja']] as const;

export function CustomerAuthScreen({store,section,mailReady,returnTo}:{store:Store;section:AuthSection;mailReady:boolean;returnTo?:string}){
 const base=`/loja/${store.slug}`,query=returnTo?`?voltar=${encodeURIComponent(returnTo)}`:'',checkout=returnTo==='checkout';
 const hidden=returnTo?<input type="hidden" name="voltar" value={returnTo}/>:null;
 return <div className="customer-auth-shell">
  <aside className="customer-auth-brand">
   <Link href={`${base}/`} className="customer-auth-store">{store.logoUrl?<img src={store.logoUrl} alt=""/>:<span className="customer-auth-initial" aria-hidden>{store.name.charAt(0).toUpperCase()}</span>}<span>{store.name}</span></Link>
   <div className="customer-auth-pitch"><p className="customer-auth-kicker">Loja de bebidas</p><h2>Sua conta em {store.name}</h2><ul>{benefits.map(([Icon,label])=><li key={label}><Icon size={20} aria-hidden/>{label}</li>)}</ul></div>
   <p className="customer-auth-powered">Plataforma Del Flash</p>
  </aside>
  <section className="customer-auth-panel">
   <Link href={checkout?`${base}/?finalizar=1`:`${base}/`} className="customer-auth-back"><ArrowLeft size={18} aria-hidden/>{checkout?'Voltar ao pedido':'Voltar à loja'}</Link>
   <div className="customer-auth-card">
    <h1 className="customer-title">{copy[section].title}</h1>
    <p className="customer-muted customer-auth-subtitle">{copy[section].subtitle}</p>
    {checkout&&section!=='confirmar'&&<p className="customer-info" role="note">Depois de entrar, você volta à finalização com a sua sacola preservada.</p>}
    {section==='confirmar'?<CustomerConfirmation slug={store.slug}/>
    :section==='recuperar'&&!mailReady?<div className="customer-info" role="status"><p>{PORTAL_MAIL_UNAVAILABLE}</p><p className="customer-hint">Configuração necessária na plataforma: provedor de e-mail (RESEND_API_KEY), remetente verificado (MAIL_FROM) e endereço público HTTPS (APP_PUBLIC_URL).</p></div>
    :section==='entrar'?<CustomerForm slug={store.slug} action="login" submit="Entrar" pendingLabel="Entrando…">{hidden}
      <label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com"/></label>
      <CustomerPassword current aside={<Link href={`${base}/conta/recuperar${query}`} className="customer-link-small">Esqueci minha senha</Link>}/>
      <label className="customer-check"><input name="remember" type="checkbox" defaultChecked/>Manter conectado por 30 dias</label>
     </CustomerForm>
    :section==='criar-conta'?<CustomerForm slug={store.slug} action="register" submit="Criar conta" pendingLabel="Criando conta…">{hidden}
      <label>Nome<input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Seu nome (sobrenome opcional)"/></label>
      <div className="customer-form-row"><label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="voce@exemplo.com"/></label><CustomerPhoneInput/></div>
      <div className="customer-form-row"><CustomerPassword hint="Mínimo de oito caracteres."/><CustomerPassword name="confirmPassword" label="Confirme a senha"/></div>
      <label className="customer-check customer-check-top"><input name="acceptTerms" type="checkbox" required/><span>Li e aceito os <Link href={`${base}/conta/termos`} target="_blank" className="customer-link-inline">termos de uso e a política de privacidade</Link>.</span></label>
      <label className="customer-check"><input name="remember" type="checkbox" defaultChecked/>Manter conectado</label>
      {mailReady&&<p className="customer-hint">Enviaremos um link para confirmar seu e-mail antes do primeiro acesso.</p>}
     </CustomerForm>
    :<CustomerForm slug={store.slug} action="recover" submit="Enviar link de recuperação" pendingLabel="Enviando…">
      <label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email"/></label>
     </CustomerForm>}
    <div className="customer-auth-switch">
     {section==='entrar'?<p>Ainda não tem conta? <Link href={`${base}/conta/criar-conta${query}`}>Criar conta</Link></p>
     :section==='criar-conta'?<p>Já tem conta? <Link href={`${base}/conta/entrar${query}`}>Entrar</Link></p>
     :<p>Lembrou a senha? <Link href={`${base}/conta/entrar${query}`}>Entrar</Link></p>}
     {checkout&&<p><Link href={`${base}/?finalizar=1`}>Continuar sem conta</Link></p>}
    </div>
   </div>
  </section>
 </div>;
}
