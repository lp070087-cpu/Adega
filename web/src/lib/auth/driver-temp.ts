import 'server-only';
import {createHmac,randomInt,timingSafeEqual} from 'node:crypto';
import {prisma} from '@/lib/db';
import {hashPassword} from './password';
import {revokeDriverSessions} from '@/lib/data/drivers';
import {withOrganizationTransaction} from '@/lib/data/transaction';
import {OperationError} from '@/lib/operation-error';
import {isPlatformIdentity} from '@/lib/platform/identity';

/**
 * Credencial temporária de primeiro acesso do entregador (sem e-mail).
 *
 * A loja gera um PIN de 4 dígitos e entrega ao entregador pessoalmente. O
 * PIN só serve para trocar a senha: nunca abre sessão. Fica guardado apenas
 * como HMAC, vale 24 h, uma única vez, e é descartado na 5ª tentativa errada
 * (chance de acerto por adivinhação: 5 em 10.000 por PIN emitido).
 *
 * A loja só emite PIN para entregadores exclusivos dela: uma conta que também
 * trabalha em outra loja não pode ter o acesso redefinido por esta.
 */
export const DRIVER_TEMP_HOURS=24;
const MAX_ATTEMPTS=5;
const secret=()=>{const value=process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET;if(!value)throw new OperationError('Configuração de autenticação ausente.');return value;};
const digest=(userId:string,pin:string)=>createHmac('sha256',secret()).update(`driver-temp:${userId}:${pin}`).digest('hex');
const identifier=(userId:string)=>`driver:temp:${userId}`;
export const isTemporaryPin=(value:string)=>/^\d{4}$/.test(value);

/** Pode esta loja emitir credencial para este entregador? */
async function exclusiveAccount(organizationId:string,driverId:string){
 const driver=await prisma.driver.findFirst({where:{id:driverId,organizationId},select:{id:true,name:true,active:true,user:{select:{id:true,email:true,active:true,organizations:{select:{organizationId:true,role:true}}}}}});
 if(!driver)throw new OperationError('Entregador não encontrado.');
 if(!driver.active)throw new OperationError('Reative o entregador antes de gerar uma senha temporária.');
 const user=driver.user;
 if(!user?.email)throw new OperationError('Cadastre o e-mail do entregador antes de gerar a senha temporária.');
 if(!user.active)throw new OperationError('Esta conta está desativada.');
 if(user.organizations.some(m=>m.organizationId!==organizationId||m.role!=='DRIVER'))throw new OperationError('Este entregador também trabalha em outra loja. Ele entra com a própria senha; se esqueceu, recupera o acesso pelo e-mail.');
 if(await isPlatformIdentity(prisma,user.id))throw new OperationError('Este acesso deve ser administrado pela plataforma.');
 return {driver,user};
}

/** Saber se a loja pode emitir PIN, sem lançar (para mostrar o botão). */
export function canIssueFor(organizationId:string,memberships:Array<{organizationId:string;role:string}>){
 return memberships.length>0&&memberships.every(m=>m.organizationId===organizationId&&m.role==='DRIVER');
}

/** Gera um novo PIN (substitui o anterior) e o devolve uma única vez. */
export async function issueTemporaryCredential(organizationId:string,driverId:string,actorId?:string){
 const {driver,user}=await exclusiveAccount(organizationId,driverId);
 const pin=String(randomInt(0,10_000)).padStart(4,'0');
 const expires=new Date(Date.now()+DRIVER_TEMP_HOURS*60*60*1000);
 await withOrganizationTransaction(organizationId,async tx=>{
  await tx.verificationToken.deleteMany({where:{identifier:identifier(user.id)}});
  await tx.verificationToken.create({data:{identifier:identifier(user.id),token:`${digest(user.id,pin)}:0`,expires}});
  await tx.notification.create({data:{organizationId,userId:actorId,type:'SYSTEM',title:'Senha temporária de entregador gerada',message:`Credencial de primeiro acesso para ${driver.name}, válida por ${DRIVER_TEMP_HOURS} horas.`}});
 });
 return {pin,expires,email:user.email!};
}

const invalid=()=>new OperationError('Acesso ou senha incorretos.');

/**
 * Confere o PIN. Sem `newPassword`, só valida (para mostrar a troca de senha);
 * com ela, grava a senha definitiva e consome o PIN. Erros contam tentativa.
 */
export async function useTemporaryCredential(email:string,pin:string,newPassword?:string){
 if(!isTemporaryPin(pin))throw invalid();
 const user=await prisma.user.findUnique({where:{email:email.trim().toLowerCase()},select:{id:true,email:true,active:true,organizations:{select:{organizationId:true,role:true,active:true}}}});
 if(!user?.active||!user.organizations.length||user.organizations.some(m=>m.role!=='DRIVER'))throw invalid();
 const stored=await prisma.verificationToken.findFirst({where:{identifier:identifier(user.id),expires:{gt:new Date()}}});
 if(!stored)throw invalid();
 const [hash,attemptsText]=stored.token.split(':');const attempts=Number(attemptsText)||0;
 const expected=Buffer.from(hash??'','hex'),given=Buffer.from(digest(user.id,pin),'hex');
 if(expected.length!==given.length||!timingSafeEqual(expected,given)){
  if(attempts+1>=MAX_ATTEMPTS)await prisma.verificationToken.deleteMany({where:{identifier:identifier(user.id),token:stored.token}});
  else await prisma.verificationToken.updateMany({where:{identifier:identifier(user.id),token:stored.token},data:{token:`${hash}:${attempts+1}`}});
  throw attempts+1>=MAX_ATTEMPTS?new OperationError('Muitas tentativas. Peça à loja uma nova senha temporária.'):invalid();
 }
 const stores=[...new Set(user.organizations.filter(m=>m.active).map(m=>m.organizationId))].sort();
 const driver=stores.length?await prisma.driver.findFirst({where:{userId:user.id,active:true,organizationId:{in:stores}},select:{id:true}}):null;
 if(!driver)throw new OperationError('Seu cadastro de entregador está suspenso. Fale com a loja.');
 if(newPassword===undefined)return {email:user.email!};
 const passwordHash=await hashPassword(newPassword);
 await prisma.$transaction(async tx=>{
  const used=await tx.verificationToken.deleteMany({where:{identifier:identifier(user.id),token:stored.token,expires:{gt:new Date()}}});
  if(used.count!==1)throw invalid();
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ANY(${stores}) ORDER BY id FOR UPDATE`;
  await tx.user.update({where:{id:user.id},data:{passwordHash,mustChangePassword:false}});
  for(const organizationId of stores)await revokeDriverSessions(tx,organizationId,user.id);
  await tx.notification.create({data:{organizationId:stores[0],userId:user.id,type:'SYSTEM',title:'Entregador ativou o acesso',message:'Senha definitiva criada com a credencial temporária.'}});
 },{timeout:15000});
 return {email:user.email!};
}
