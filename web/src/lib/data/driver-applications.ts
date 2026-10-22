import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withOrganizationTransaction } from './transaction';
import { hashPassword } from '@/lib/auth/password';
import { driverMailReady,driverTokenHash } from '@/lib/auth/driver-access';
import { isPlatformIdentity } from '@/lib/platform/identity';
import { assertPlatformQuota } from '@/lib/platform/quotas';
import { revokeDriverSessions } from './drivers';
import { OperationError } from '@/lib/operation-error';
import { registrationSlug,registrationPath,validApplicationTransition,type ApplicationStatus } from '@/lib/driver-applications-rules';

export async function driverApplicationsReady(){
 if(process.env.DRIVER_APPLICATIONS_ENABLED!=='true')return false;
 const rows=await prisma.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public."DriverRegistrationLink"') IS NOT NULL AND to_regclass('public."DriverApplication"') IS NOT NULL AND to_regclass('public."DriverApplicationEvent"') IS NOT NULL AND to_regclass('public."Driver_organizationId_userId_key"') IS NOT NULL AND to_regclass('public."Driver_userId_key"') IS NULL AS ready`;
 return rows[0]?.ready===true;
}
/** E-mail confirmation is required while a real provider is configured; without one, the store's explicit approval is the gate. */
const identityAccepted=(user:{emailVerified:Date|null})=>Boolean(user.emailVerified)||!driverMailReady();
async function ready(){if(!await driverApplicationsReady())throw new OperationError('Solicitações de entregadores aguardam ativação segura pela plataforma.');}
export async function getRegistrationLink(organizationId:string){if(!await driverApplicationsReady())return null;return prisma.driverRegistrationLink.findUnique({where:{organizationId}});}
export async function createRegistrationLink(organizationId:string){
 await ready();return withOrganizationTransaction(organizationId,async tx=>{
 const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{name:true,status:true}});
 if(['CANCELLED','SUSPENDED'].includes(org.status))throw new OperationError('Estabelecimento indisponível.');
 return tx.driverRegistrationLink.upsert({where:{organizationId},create:{organizationId,slug:registrationSlug(org.name)},update:{}});
 });
}
export async function resolveRegistrationLink(number:string){
 if(!/^\d{1,10}$/.test(number)||!Number.isSafeInteger(Number(number))||Number(number)>2147483647||!await driverApplicationsReady())return null;
 const link=await prisma.driverRegistrationLink.findUnique({where:{number:Number(number)},include:{organization:{select:{id:true,name:true,logoUrl:true,brandColor:true,status:true}}}});
 return link&&!['CANCELLED','SUSPENDED'].includes(link.organization.status)?link:null;
}
export async function listDriverApplications(organizationId:string){if(!await driverApplicationsReady())return [];const select={user:{select:{name:true,email:true,emailVerified:true}},events:{orderBy:{createdAt:'desc' as const},take:5}};const [pending,others]=await Promise.all([prisma.driverApplication.findMany({where:{organizationId,status:'PENDING'},include:select,orderBy:{createdAt:'asc'},take:200}),prisma.driverApplication.findMany({where:{organizationId,status:{not:'PENDING'}},include:select,orderBy:{createdAt:'desc'},take:200})]);return [...pending,...others];}
export async function pendingDriverApplicationCount(organizationId:string){if(!await driverApplicationsReady())return 0;return prisma.driverApplication.count({where:{organizationId,status:'PENDING'}});}
export async function ownDriverApplications(userId:string){if(!await driverApplicationsReady())return [];return prisma.driverApplication.findMany({where:{userId},include:{organization:{select:{name:true}}},orderBy:{createdAt:'desc'},take:100});}
async function addApplication(tx:Prisma.TransactionClient,organizationId:string,userId:string){
 const store=await tx.organization.findUnique({where:{id:organizationId},select:{status:true}});
 const user=await tx.user.findUnique({where:{id:userId},include:{organizations:true}});
 if(!store||['CANCELLED','SUSPENDED'].includes(store.status)||!user?.active||!identityAccepted(user)||user.mustChangePassword||user.organizations.some(m=>m.role!=='DRIVER')||await isPlatformIdentity(tx,userId))throw new OperationError(driverMailReady()?'Use uma conta individual de entregador com e-mail confirmado.':'Use uma conta individual de entregador ativa.');
 const existing=await tx.driverApplication.findUnique({where:{organizationId_userId:{organizationId,userId}}});
 if(existing)return existing;
 const membership=await tx.organizationUser.findUnique({where:{organizationId_userId:{organizationId,userId}}});
 if(membership)throw new OperationError('Seu vínculo já existe. Consulte o acesso com a loja.');
 return tx.driverApplication.create({data:{organizationId,userId,events:{create:{actorId:userId,status:'PENDING',reason:'Solicitação pelo link exclusivo da loja.'}}}});
}
export async function applyToStore(organizationId:string,userId:string){await ready();return withOrganizationTransaction(organizationId,tx=>addApplication(tx,organizationId,userId));}
/**
 * Self-registration through the store's single link. With a mail provider the
 * account is only created after the e-mail link is confirmed; without one it is
 * created immediately (unverified) together with a PENDING application, so
 * nothing operational is granted before the store approves it.
 */
export async function requestDriverRegistration(linkNumber:string,input:{name:string;email:string;password:string}):Promise<'session'|'verify'>{
 await ready();
 const link=await resolveRegistrationLink(linkNumber);if(!link)throw new OperationError('Link da loja indisponível.');
 if(!driverMailReady()){
  const passwordHash=await hashPassword(input.password);
  await withOrganizationTransaction(link.organizationId,async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 6173))`;
   const existing=await tx.user.findUnique({where:{email:input.email},select:{id:true,passwordHash:true,mustChangePassword:true}});
   if(existing)throw new OperationError(existing.passwordHash&&!existing.mustChangePassword?'Este e-mail já tem conta. Use “Entrar” para solicitar o vínculo com esta loja.':'Este e-mail já tem um cadastro aguardando ativação por e-mail. A ativação será liberada quando a plataforma configurar o envio de e-mails.');
   const user=await tx.user.create({data:{name:input.name,email:input.email,passwordHash}});
   await addApplication(tx,link.organizationId,user.id);
  });
  return 'session';
 }
 const token=randomBytes(32).toString('hex'),digest=driverTokenHash(token);
 const prefix=`driver:application:${link.organizationId}:${driverTokenHash(input.email)}:`;
 const passwordHash=await hashPassword(input.password);
 const identifier=prefix+Buffer.from(JSON.stringify({name:input.name,email:input.email,passwordHash})).toString('base64url');
 await withOrganizationTransaction(link.organizationId,async tx=>{
  if(await tx.user.findUnique({where:{email:input.email},select:{id:true}}))throw new OperationError('Se já possui conta, entre para solicitar o vínculo sem criar outra identidade.');
  if(await tx.verificationToken.findFirst({where:{identifier:{startsWith:prefix},expires:{gt:new Date()}}}))throw new OperationError('Confira o link enviado anteriormente. Ele é válido por 30 minutos.');
  await tx.verificationToken.deleteMany({where:{identifier:{startsWith:prefix}}});
  await tx.verificationToken.create({data:{identifier,token:digest,expires:new Date(Date.now()+30*60*1000)}});
 });
 const url=new URL('/entregador/solicitacao/confirmar',process.env.APP_PUBLIC_URL!);url.hash=new URLSearchParams({loja:linkNumber,token}).toString();
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[input.email],subject:`Confirme sua solicitação · ${link.organization.name}`,text:`Confirme seu e-mail para solicitar acesso de entregador: ${url}\nVálido por 30 minutos e uso único. A aprovação será feita pela loja. Se não solicitou, ignore.`})});
  if(!response.ok)throw new Error('MAIL_FAILED');
 }catch{await prisma.verificationToken.deleteMany({where:{identifier,token:digest}});throw new OperationError('Falha no envio. Tente novamente; nenhum acesso foi liberado.');}
 return 'verify';
}
export async function confirmDriverRegistration(number:string,token:string){
 await ready();if(!/^[a-f0-9]{64}$/.test(token))throw new OperationError('Link inválido ou expirado.');
 const link=await resolveRegistrationLink(number);if(!link)throw new OperationError('Loja indisponível.');
 return withOrganizationTransaction(link.organizationId,async tx=>{
  const row=await tx.verificationToken.findFirst({where:{identifier:{startsWith:`driver:application:${link.organizationId}:`},token:driverTokenHash(token),expires:{gt:new Date()}}});
  if(!row)throw new OperationError('Link inválido, expirado ou já usado.');
  const data=JSON.parse(Buffer.from(row.identifier.split(':').at(-1)!,'base64url').toString()) as {name:string;email:string;passwordHash:string};
  // Serialize the same identity across requests from different stores.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${data.email}, 6173))`;
  if(await tx.user.findUnique({where:{email:data.email},select:{id:true}}))throw new OperationError('A conta já existe. Entre e solicite o vínculo; sua senha não foi alterada.');
  const used=await tx.verificationToken.deleteMany({where:{identifier:row.identifier,token:row.token,expires:{gt:new Date()}}});
  if(used.count!==1)throw new OperationError('Link já utilizado.');
  const user=await tx.user.create({data:{name:data.name,email:data.email,passwordHash:data.passwordHash,emailVerified:new Date()}});
  return addApplication(tx,link.organizationId,user.id);
 });
}
export async function decideDriverApplication(organizationId:string,id:string,status:ApplicationStatus,actorId:string,reason:string){
 await ready();return withOrganizationTransaction(organizationId,async tx=>{
 const application=await tx.driverApplication.findFirst({where:{id,organizationId},include:{user:{include:{organizations:true}}}});
 if(!application||!validApplicationTransition(application.status,status))throw new OperationError('Solicitação alterada ou decisão inválida. Atualize a página.');
 const user=application.user;
 if(status==='APPROVED'){
  const store=await tx.organization.findUnique({where:{id:organizationId},select:{status:true}});
  if(!store||['SUSPENDED','CANCELLED'].includes(store.status))throw new OperationError('O estabelecimento não pode liberar novos acessos enquanto estiver suspenso ou cancelado.');
  if(!user.active||!identityAccepted(user)||user.mustChangePassword||user.organizations.some(m=>m.role!=='DRIVER')||await isPlatformIdentity(tx,user.id))throw new OperationError('Identidade não elegível para aprovação.');
  const membership=await tx.organizationUser.findUnique({where:{organizationId_userId:{organizationId,userId:user.id}}});
  if(membership&&membership.role!=='DRIVER')throw new OperationError('A conta possui outro papel nesta loja.');
  const driver=await tx.driver.findFirst({where:{organizationId,userId:user.id}});
  if(!driver?.active)await assertPlatformQuota(tx,organizationId,'drivers');
  if(driver)await tx.driver.update({where:{id:driver.id},data:{active:true,status:'OFFLINE'}});
  else await tx.driver.create({data:{organizationId,userId:user.id,name:user.name,phone:'',active:true,status:'OFFLINE'}});
  await tx.organizationUser.upsert({where:{organizationId_userId:{organizationId,userId:user.id}},create:{organizationId,userId:user.id,role:'DRIVER',active:true,acceptedAt:new Date()},update:{active:true,acceptedAt:new Date()}});
 }else if(['SUSPENDED','REVOKED'].includes(status)){
  if(await tx.order.count({where:{organizationId,driver:{userId:user.id},status:{in:['WAITING_DRIVER','DISPATCHED']}}}))throw new OperationError('Resolva as entregas atribuídas antes de remover o acesso.');
  await tx.driver.updateMany({where:{organizationId,userId:user.id},data:{active:false,status:'OFFLINE'}});
  await tx.organizationUser.updateMany({where:{organizationId,userId:user.id,role:'DRIVER'},data:{active:false}});
  await revokeDriverSessions(tx,organizationId,user.id);
 }
 const updated=await tx.driverApplication.updateMany({where:{id,organizationId,status:application.status},data:{status}});
 if(updated.count!==1)throw new OperationError('Decisão concorrente. Atualize a página.');
 await tx.driverApplicationEvent.create({data:{applicationId:id,actorId,status,reason}});
 });
}
export {registrationPath};
