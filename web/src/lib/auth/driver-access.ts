import 'server-only';
import {createHash,createHmac,randomInt,timingSafeEqual} from 'node:crypto';
import {prisma} from '@/lib/db';
import {hashPassword} from './password';
import {revokeDriverSessions} from '@/lib/data/drivers';
import {OperationError} from '@/lib/operation-error';
import {isPlatformIdentity} from '@/lib/platform/identity';

/**
 * Primeiro acesso e recuperação do entregador são o mesmo caminho: o titular
 * informa o e-mail cadastrado pela loja, recebe um código de 6 dígitos nesse
 * e-mail e define a senha. Sem o código ninguém assume a conta só por saber
 * o endereço. O código fica guardado apenas como HMAC, vale 10 minutos, uma
 * única vez, e é descartado após 5 tentativas erradas.
 */
export const DRIVER_CODE_MINUTES=10;
const MAX_ATTEMPTS=5;
const RESEND_SECONDS=60;
export const DRIVER_MAIL_SETTINGS=['RESEND_API_KEY','MAIL_FROM','APP_PUBLIC_URL'] as const;

export const driverTokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function driverMailReady(){
 try{return Boolean(process.env.RESEND_API_KEY&&process.env.MAIL_FROM&&new URL(process.env.APP_PUBLIC_URL??'').protocol==='https:');}catch{return false;}
}
const secret=()=>{const value=process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET;if(!value)throw new OperationError('Configuração de autenticação ausente.');return value;};
const codeDigest=(userId:string,code:string)=>createHmac('sha256',secret()).update(`driver-code:${userId}:${code}`).digest('hex');
const identifier=(userId:string,email:string)=>`driver:code:${userId}:${driverTokenHash(email)}`;
const normalize=(email:string)=>email.trim().toLowerCase();

/** Conta exclusivamente de entregador, ativa, com ao menos uma loja ativa. */
async function eligible(email:string){
 const user=await prisma.user.findUnique({where:{email},include:{organizations:true}});
 if(!user?.active||!user.email||!user.organizations.length||user.organizations.some(m=>m.role!=='DRIVER'))return null;
 if(await isPlatformIdentity(prisma,user.id))return null;
 const stores=user.organizations.filter(m=>m.active).map(m=>m.organizationId);
 const driver=await prisma.driver.findFirst({where:{userId:user.id,active:true,organizationId:{in:stores}},select:{id:true,organizationId:true}});
 return driver?{user,driver}:null;
}

/** Resposta pública idêntica para e-mail ausente, suspenso ou de outro tipo de conta. */
export async function requestDriverCode(email:string){
 if(!driverMailReady())throw new OperationError('Envio de e-mail aguardando configuração pela plataforma.');
 const account=await eligible(normalize(email));
 if(!account)return;
 const key=identifier(account.user.id,account.user.email!);
 const current=await prisma.verificationToken.findFirst({where:{identifier:key}});
 // Reenvio só depois de 60 s: limita custo e spam para o titular.
 if(current&&current.expires.getTime()-DRIVER_CODE_MINUTES*60_000+RESEND_SECONDS*1000>Date.now())return;
 const code=String(randomInt(0,1_000_000)).padStart(6,'0');
 const token=`${codeDigest(account.user.id,code)}:0`;
 await prisma.$transaction([
  prisma.verificationToken.deleteMany({where:{identifier:key}}),
  prisma.verificationToken.create({data:{identifier:key,token,expires:new Date(Date.now()+DRIVER_CODE_MINUTES*60_000)}}),
 ]);
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:process.env.MAIL_FROM,to:[account.user.email],subject:`Seu código de acesso Del Flash Entregador: ${code}`,text:`Seu código para criar ou redefinir a senha do aplicativo do entregador é ${code}.\n\nVálido por ${DRIVER_CODE_MINUTES} minutos, uma única vez. Não compartilhe este código com ninguém, nem com a loja. Se você não pediu, ignore este e-mail.`})});
  if(!response.ok)throw new Error('MAIL_FAILED');
 }catch{
  await prisma.verificationToken.deleteMany({where:{identifier:key,token}});
  throw new OperationError('Não foi possível enviar o e-mail. Tente novamente em instantes.');
 }
}

const invalid=()=>new OperationError('Código inválido ou expirado. Peça um novo código.');

/** Confere o código, grava a senha e devolve o e-mail para o login automático. */
export async function confirmDriverCode(email:string,code:string,password:string){
 if(!/^\d{6}$/.test(code))throw invalid();
 const account=await eligible(normalize(email));
 if(!account)throw invalid();
 const userId=account.user.id,key=identifier(userId,account.user.email!);
 const stored=await prisma.verificationToken.findFirst({where:{identifier:key,expires:{gt:new Date()}}});
 if(!stored)throw invalid();
 const [digest,attemptsText]=stored.token.split(':');
 const attempts=Number(attemptsText)||0;
 const expected=Buffer.from(digest??'','hex'),given=Buffer.from(codeDigest(userId,code),'hex');
 if(expected.length!==given.length||!timingSafeEqual(expected,given)){
  // Conta a tentativa de forma atômica: só quem leu o mesmo token consegue trocá-lo.
  if(attempts+1>=MAX_ATTEMPTS)await prisma.verificationToken.deleteMany({where:{identifier:key,token:stored.token}});
  else await prisma.verificationToken.updateMany({where:{identifier:key,token:stored.token},data:{token:`${digest}:${attempts+1}`}});
  throw attempts+1>=MAX_ATTEMPTS?new OperationError('Muitas tentativas. Peça um novo código.'):invalid();
 }
 const passwordHash=await hashPassword(password);
 await prisma.$transaction(async tx=>{
  const used=await tx.verificationToken.deleteMany({where:{identifier:key,token:stored.token,expires:{gt:new Date()}}});
  if(used.count!==1)throw invalid();
  const current=await tx.user.findUnique({where:{id:userId},include:{organizations:true}});
  if(!current?.active||current.email!==account.user.email||current.organizations.some(m=>m.role!=='DRIVER'))throw new OperationError('Acesso indisponível. Fale com a loja.');
  if(await isPlatformIdentity(tx,userId))throw new OperationError('Este acesso deve ser administrado pela plataforma.');
  await tx.user.update({where:{id:userId},data:{passwordHash,mustChangePassword:false,emailVerified:new Date()}});
  // Senha nova derruba qualquer sessão anterior em todas as lojas.
  const stores=[...new Set(current.organizations.map(m=>m.organizationId))].sort();
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ANY(${stores}) ORDER BY id FOR UPDATE`;
  for(const organizationId of stores)await revokeDriverSessions(tx,organizationId,userId);
  await tx.notification.create({data:{organizationId:account.driver.organizationId,userId,type:'SYSTEM',title:'Senha de entregador definida',message:'O titular confirmou o e-mail com código de verificação.'}});
 },{timeout:15000});
 return account.user.email!;
}
