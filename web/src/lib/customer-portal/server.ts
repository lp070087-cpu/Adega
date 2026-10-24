import 'server-only';
import { randomBytes,createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { hashPassword,verifyPassword,fakeVerify } from '@/lib/auth/password';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { OperationError } from '@/lib/operation-error';
import { portalMailReady,portalVerifiedFilter } from './mail';
import { registrationSchema,emailSchema,passwordSchema,PORTAL_TABLES,validSlug } from './policy';

export { portalMailReady,portalVerifiedFilter };
export const portalHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const portalCookie=(slug:string)=>`df_customer_${portalHash(slug).slice(0,16)}`;
const portalPath=(slug:string)=>`/loja/${slug}/`;
/** Enabled once the approved migration exists; CUSTOMER_PORTAL_ENABLED=false remains an emergency switch. */
export async function portalReady(){
  if(process.env.CUSTOMER_PORTAL_ENABLED==='false')return false;
  try{const rows=await prisma.$queryRaw<Array<{name:string|null}>>`SELECT unnest(ARRAY[to_regclass('public."CustomerPortalAccount"')::text,to_regclass('public."CustomerPortalSession"')::text,to_regclass('public."CustomerPortalToken"')::text,to_regclass('public."CustomerPortalAddress"')::text,to_regclass('public."CustomerPortalOrder"')::text,(SELECT 'termsAcceptedAt' FROM information_schema.columns WHERE table_schema='public' AND table_name='CustomerPortalAccount' AND column_name='termsAcceptedAt')]) AS name`;return rows.length===PORTAL_TABLES.length+1&&rows.every(row=>Boolean(row.name));}catch{return false;}
}
export async function portalStore(slug:string){if(!validSlug(slug))throw new OperationError('Loja inválida.');const store=await prisma.organization.findUnique({where:{slug},select:{id:true,slug:true,name:true,brandColor:true,logoUrl:true,status:true,settings:true,latitude:true,longitude:true}});if(!store||store.status==='CANCELLED')throw new OperationError('Loja indisponível.');return store;}
export async function requirePortalReady(){if(!await portalReady())throw new OperationError('A área de conta aguarda ativação segura pela plataforma. A sacola e a compra sem login continuam disponíveis.');}
export async function portalSession(slug:string){
  if(!await portalReady()||!validSlug(slug))return null;
  const token=(await cookies()).get(portalCookie(slug))?.value;if(!token||!/^\w{64}$/.test(token))return null;
  const session=await prisma.customerPortalSession.findFirst({where:{tokenHash:portalHash(token),expiresAt:{gt:new Date()},account:{organization:{slug,status:{not:'CANCELLED'}},active:true,...portalVerifiedFilter()}},include:{account:true}});
  return session?{...session.account,portalSessionHash:session.tokenHash}:null;
}
export async function requireCustomerAccount(slug:string){await requirePortalReady();const account=await portalSession(slug);if(!account)throw new OperationError('Entre na sua conta para continuar.');return account;}

export const PORTAL_MAIL_UNAVAILABLE='A recuperação por e-mail está indisponível no momento: o provedor de envio ainda não foi configurado pela plataforma. Fale com a loja para obter ajuda.';
async function sendPortalMail(email:string,store:{slug:string;name:string},token:string,purpose:string){
  if(!portalMailReady())throw new OperationError('O envio de e-mail aguarda configuração da plataforma.');
  const url=new URL(`/loja/${store.slug}/conta/confirmar`,process.env.APP_PUBLIC_URL!);url.hash=new URLSearchParams({token,acao:purpose}).toString();
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:process.env.MAIL_FROM,to:[email],subject:`${purpose==='RESET'?'Recupere sua senha':'Confirme seu e-mail'} · ${store.name}`,text:`Confirme sua solicitação na loja ${store.name}: ${url.toString()}\n\nEste link vale por 30 minutos e só pode ser usado uma vez. Se não solicitou, ignore esta mensagem.`})});
  if(!response.ok)throw new OperationError('Não foi possível enviar o e-mail. Tente novamente mais tarde.');
}
async function issuePortalToken(accountId:string,store:{slug:string;name:string},email:string,purpose:string,newEmail?:string,pendingPasswordHash?:string){
  const recent=await prisma.customerPortalToken.findFirst({where:{accountId,purpose,createdAt:{gt:new Date(Date.now()-60000)}}});
  if(recent)return;
  const raw=randomBytes(32).toString('hex'),tokenHash=portalHash(raw);
  await prisma.customerPortalToken.create({data:{tokenHash,accountId,purpose,email:newEmail,passwordHash:pendingPasswordHash,expiresAt:new Date(Date.now()+30*60000)}});
  try{await sendPortalMail(email,store,raw,purpose);}catch(error){await prisma.customerPortalToken.deleteMany({where:{tokenHash}});throw error;}
}
/** Returns `session` when the account can be used immediately (no mail provider), `verify` when a confirmation link was sent. */
export async function registerPortalAccount(slug:string,input:unknown,remember=false):Promise<'session'|'verify'>{
  await requirePortalReady();
  const data=registrationSchema.parse(input),store=await portalStore(slug),mail=portalMailReady();
  const passwordHash=await hashPassword(data.password);
  const existing=await prisma.customerPortalAccount.findUnique({where:{organizationId_email:{organizationId:store.id,email:data.email}}});
  if(existing){
    // With mail, the answer is identical for new and existing addresses (no enumeration); without it, a duplicate must be refused explicitly.
    if(!mail)throw new OperationError('Já existe uma conta com este e-mail nesta loja. Entre ou recupere sua senha.');
    if(!existing.emailVerifiedAt&&existing.active)await issuePortalToken(existing.id,store,existing.email,'VERIFY',undefined,passwordHash);
    return 'verify';
  }
  let account;
  try{account=await prisma.customerPortalAccount.create({data:{organizationId:store.id,firstName:data.name,email:data.email,phone:data.phone,passwordHash,termsAcceptedAt:new Date()}});}
  catch(error){if((error as {code?:string})?.code==='P2002')throw new OperationError(mail?'Confira seu e-mail para continuar.':'Já existe uma conta com este e-mail nesta loja. Entre ou recupere sua senha.');throw error;}
  if(mail){await issuePortalToken(account.id,store,account.email,'VERIFY',undefined,passwordHash);return 'verify';}
  await openPortalSession(slug,store.id,account.id,account.passwordHash,remember);
  return 'session';
}
async function openPortalSession(slug:string,organizationId:string,accountId:string,passwordHash:string,remember:boolean){
  const raw=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+(remember?30*24:12)*3600000);
  await withOrganizationTransaction(organizationId,async tx=>{
    const current=await tx.customerPortalAccount.findFirst({where:{id:accountId,organizationId,active:true,passwordHash,...portalVerifiedFilter()}});
    if(!current)throw new OperationError('Sua conta mudou. Entre novamente.');
    await tx.customerPortalAccount.update({where:{id:accountId},data:{failedAttempts:0,lockedUntil:null}});
    await tx.customerPortalSession.deleteMany({where:{accountId,expiresAt:{lte:new Date()}}});
    await tx.customerPortalSession.create({data:{accountId,tokenHash:portalHash(raw),expiresAt}});
  });
  (await cookies()).set(portalCookie(slug),raw,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:portalPath(slug),...(remember?{maxAge:30*24*3600}:{})});
}
export async function loginPortalAccount(slug:string,email:string,password:string,remember:boolean){
  await requirePortalReady();const store=await portalStore(slug),normalized=emailSchema.parse(email);
  if(!password||new TextEncoder().encode(password).length>72)throw new OperationError('E-mail ou senha incorretos.');
  const account=await prisma.customerPortalAccount.findUnique({where:{organizationId_email:{organizationId:store.id,email:normalized}}});
  if(!account){await fakeVerify(password);throw new OperationError('E-mail ou senha incorretos.');}
  if(account.lockedUntil&&account.lockedUntil>new Date()){await fakeVerify(password);throw new OperationError('Aguarde alguns minutos antes de tentar novamente.');}
  const valid=await verifyPassword(password,account.passwordHash);
  if(!valid){await withOrganizationTransaction(store.id,async tx=>{const current=await tx.customerPortalAccount.findUnique({where:{id:account.id}});if(!current)return;const attempts=(current.lockedUntil&&current.lockedUntil<=new Date()?0:current.failedAttempts)+1;await tx.customerPortalAccount.update({where:{id:account.id},data:{failedAttempts:attempts,lockedUntil:attempts>=5?new Date(Date.now()+15*60000):null}});});throw new OperationError('E-mail ou senha incorretos.');}
  if(!account.active)throw new OperationError('Sua conta está inativa. Entre em contato com a loja.');
  if(!account.emailVerifiedAt&&portalMailReady())throw new OperationError('Confirme seu e-mail antes de entrar. Em Criar conta, solicite novamente a confirmação.');
  await openPortalSession(slug,store.id,account.id,account.passwordHash,remember);
}
export async function logoutPortalAccount(slug:string){
  if(!validSlug(slug))return;const jar=await cookies(),token=jar.get(portalCookie(slug))?.value;
  if(token&&await portalReady())await prisma.customerPortalSession.deleteMany({where:{tokenHash:portalHash(token),account:{organization:{slug}}}});
  jar.set(portalCookie(slug),'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:portalPath(slug),maxAge:0});
}
export async function requestPortalReset(slug:string,email:string){
  await requirePortalReady();if(!portalMailReady())throw new OperationError(PORTAL_MAIL_UNAVAILABLE);
  const store=await portalStore(slug),account=await prisma.customerPortalAccount.findUnique({where:{organizationId_email:{organizationId:store.id,email:emailSchema.parse(email)}}});
  // Without prior mail verification, nobody proved ownership of the address; the reset link itself proves it.
  if(account?.active)await issuePortalToken(account.id,store,account.email,'RESET');
}
export async function consumePortalToken(slug:string,raw:string,password?:string,confirmPassword?:string){
  await requirePortalReady();if(!/^[a-f0-9]{64}$/.test(raw))throw new OperationError('Link inválido ou expirado.');
  const store=await portalStore(slug);const token=await prisma.customerPortalToken.findFirst({where:{tokenHash:portalHash(raw),expiresAt:{gt:new Date()},account:{organizationId:store.id,active:true}}});
  if(!token)throw new OperationError('Link inválido, expirado ou já utilizado.');
  const passwordHash=token.purpose==='RESET'?await hashPassword(passwordSchema.parse(password)):undefined;
  if(token.purpose==='RESET'&&password!==confirmPassword)throw new OperationError('As senhas não coincidem.');
  await withOrganizationTransaction(store.id,async tx=>{
    const used=await tx.customerPortalToken.deleteMany({where:{tokenHash:token.tokenHash,expiresAt:{gt:new Date()},account:{organizationId:store.id,active:true,...(token.purpose==='VERIFY'?{emailVerifiedAt:null}:{})}}});if(used.count!==1)throw new OperationError('Link já utilizado.');
    if(token.purpose==='VERIFY')await tx.customerPortalAccount.update({where:{id:token.accountId},data:{emailVerifiedAt:new Date(),...(token.passwordHash?{passwordHash:token.passwordHash}:{})}});
    else if(token.purpose==='RESET')await tx.customerPortalAccount.update({where:{id:token.accountId},data:{passwordHash,failedAttempts:0,lockedUntil:null,emailVerifiedAt:new Date()}});
    else if(token.purpose==='EMAIL'&&token.email)await tx.customerPortalAccount.update({where:{id:token.accountId},data:{email:token.email,emailVerifiedAt:new Date()}});
    else throw new OperationError('Link inválido.');
    await tx.customerPortalSession.deleteMany({where:{accountId:token.accountId}});
    await tx.customerPortalToken.deleteMany({where:{accountId:token.accountId}});
  });
}
export async function changePortalEmail(slug:string,email:string,password:string){
  const account=await requireCustomerAccount(slug);if(!portalMailReady())throw new OperationError('A troca de e-mail exige confirmação por e-mail, ainda não configurada pela plataforma.');if(!await verifyPassword(password,account.passwordHash))throw new OperationError('Senha atual incorreta.');
  const normalized=emailSchema.parse(email);if(normalized===account.email)return;
  await issuePortalToken(account.id,await portalStore(slug),normalized,'EMAIL',normalized);
}
