import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {prisma} from '@/lib/db';
import {withOrganizationTransaction} from '@/lib/data/transaction';
import {hashPassword} from './password';
import {revokeDriverSessions} from '@/lib/data/drivers';
import {OperationError} from '@/lib/operation-error';
import {isPlatformIdentity} from '@/lib/platform/identity';

export type DriverAccessMode='activate'|'reset';
export const driverTokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function driverMailReady(){
 try{return Boolean(process.env.RESEND_API_KEY&&process.env.MAIL_FROM&&new URL(process.env.APP_PUBLIC_URL??'').protocol==='https:');}catch{return false;}
}
async function eligible(email:string){
 const user=await prisma.user.findUnique({where:{email},include:{organizations:true}});
 if(!user?.active||!user.email||user.organizations.some(m=>m.role!=='DRIVER'))return null;
 if(await isPlatformIdentity(prisma,user.id))return null;
 const driver=await prisma.driver.findFirst({where:{userId:user.id,active:true,organizationId:{in:user.organizations.filter(m=>m.active).map(m=>m.organizationId)}},select:{id:true,organizationId:true}});
 if(driver)return {user,driver,applicant:false};
 if(user.emailVerified&&process.env.DRIVER_APPLICATIONS_ENABLED==='true'&&await (await import('@/lib/data/driver-applications')).driverApplicationsReady()){
  const application=await prisma.driverApplication.findFirst({where:{userId:user.id},select:{organizationId:true}});
  if(application)return {user,driver:{id:'',organizationId:application.organizationId},applicant:true};
 }
 return null;
}
const identifier=(mode:DriverAccessMode,userId:string,email:string)=>`driver:${mode}:${userId}:${driverTokenHash(email)}`;

/** Resposta pública idêntica para e-mail ausente, inativo ou de proprietário. */
export async function requestDriverAccess(email:string,mode:DriverAccessMode){
 if(!driverMailReady())throw new OperationError('Envio de e-mail aguardando configuração pela plataforma.');
 const account=await eligible(email.toLowerCase().trim());
 if(!account||(mode==='activate'&&!account.user.mustChangePassword))return;
 const token=randomBytes(32).toString('hex');const digest=driverTokenHash(token);
 const key=identifier(mode,account.user.id,account.user.email!);
 const created=await withOrganizationTransaction(account.driver.organizationId,async tx=>{
   const current=account.applicant?await tx.driverApplication.findFirst({where:{organizationId:account.driver.organizationId,userId:account.user.id,user:{active:true,email:account.user.email,emailVerified:{not:null}}},select:{id:true}}):await tx.driver.findFirst({where:{id:account.driver.id,organizationId:account.driver.organizationId,active:true,user:{active:true,email:account.user.email}},select:{id:true}});
   if(!current)return false;
   const pending=await tx.verificationToken.findFirst({where:{identifier:key,expires:{gt:new Date()}}});
   if(pending)return false;
   await tx.verificationToken.deleteMany({where:{identifier:key}});
   await tx.verificationToken.create({data:{identifier:key,token:digest,expires:new Date(Date.now()+30*60*1000)}});
   return true;
 });
 if(!created)return;
 const url=new URL('/entregador/acesso',process.env.APP_PUBLIC_URL!);
 // Fragmento não é enviado no GET nem em logs/referrers do servidor.
 url.hash=new URLSearchParams({acao:mode,usuario:account.user.id,token}).toString();
 try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:process.env.MAIL_FROM,to:[account.user.email],subject:mode==='activate'?'Ative seu acesso de entregador':'Recupere seu acesso de entregador',text:`Use este link para definir sua senha: ${url.toString()}\n\nVálido por 30 minutos, uma única vez. Se não solicitou, ignore este e-mail.`})});
   if(!response.ok)throw new Error('MAIL_FAILED');
 }catch{
   await prisma.verificationToken.deleteMany({where:{identifier:key,token:digest}});
   throw new OperationError('Não foi possível enviar o e-mail. Tente novamente mais tarde.');
 }
}

export async function consumeDriverAccess(userId:string,token:string,mode:DriverAccessMode,password:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new OperationError('Link inválido ou expirado. Solicite outro.');
 const user=await prisma.user.findUnique({where:{id:userId},select:{email:true}});
 const account=user?.email?await eligible(user.email):null;
 if(!account||(mode==='activate'&&!account.user.mustChangePassword))throw new OperationError('Link inválido ou expirado. Solicite outro.');
 const key=identifier(mode,userId,account.user.email!);const digest=driverTokenHash(token);
 const valid=await prisma.verificationToken.findFirst({where:{identifier:key,token:digest,expires:{gt:new Date()}}});
 if(!valid)throw new OperationError('Link inválido ou expirado. Solicite outro.');
 const passwordHash=await hashPassword(password);
 await withOrganizationTransaction(account.driver.organizationId,async tx=>{
   const current=await tx.user.findUnique({where:{id:userId},include:{organizations:true}});
   const driver=account.applicant?await tx.driverApplication.findFirst({where:{organizationId:account.driver.organizationId,userId},select:{id:true}}):await tx.driver.findFirst({where:{id:account.driver.id,organizationId:account.driver.organizationId,userId,active:true},select:{id:true}});
   if(!driver||!current?.active||current.email!==account.user.email||current.organizations.some(m=>m.role!=='DRIVER')||(!account.applicant&&!current.organizations.some(m=>m.organizationId===account.driver.organizationId&&m.role==='DRIVER'&&m.active))||(account.applicant&&!current.emailVerified)||(mode==='activate'&&!current.mustChangePassword))throw new OperationError('Acesso indisponível. Solicite um novo link.');
   if(await isPlatformIdentity(tx,userId))throw new OperationError('Este acesso deve ser administrado pela plataforma.');
   const used=await tx.verificationToken.deleteMany({where:{identifier:key,token:digest,expires:{gt:new Date()}}});
   if(used.count!==1)throw new OperationError('Link inválido ou expirado. Solicite outro.');
   await tx.user.update({where:{id:userId},data:{passwordHash,mustChangePassword:false,emailVerified:new Date()}});
   await tx.verificationToken.deleteMany({where:{identifier:{startsWith:`driver:${mode==='activate'?'reset':'activate'}:${userId}:`}}});
   await revokeDriverSessions(tx,account.driver.organizationId,userId);
   for(const organizationId of [...new Set(current.organizations.map(m=>m.organizationId))].filter(id=>id!==account.driver.organizationId).sort())await revokeDriverSessions(tx,organizationId,userId);
   await tx.notification.create({data:{organizationId:account.driver.organizationId,userId,type:'SYSTEM',title:mode==='activate'?'Acesso de entregador ativado':'Senha de entregador redefinida',message:'Verificação por link de e-mail concluída pelo titular.'}});
 });
 return account.user.email!;
}
