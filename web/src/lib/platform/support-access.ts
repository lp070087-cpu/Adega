import 'server-only';
import {randomUUID} from 'node:crypto';
import {prisma} from '@/lib/db';
import {requirePlatformRole,PlatformAccessError} from './auth';

export type SupportGrant={id:string;operatorId:string;organizationId:string;driverId:string|null;reason:string;createdAt:string;expiresAt:string;revokedAt?:string};
const key=(id:string)=>`support-access:${id}`;
function grantValue(value:unknown):SupportGrant{
 const grant=value as SupportGrant|null;
 if(!grant||typeof grant.id!=='string'||typeof grant.operatorId!=='string'||typeof grant.organizationId!=='string'||!Number.isFinite(Date.parse(grant.expiresAt)))throw new PlatformAccessError('Acesso de suporte inválido.');
 return grant;
}
export async function createSupportAccess(organizationId:string,driverId:string|null,reason:string){
 const ctx=await requirePlatformRole(['OWNER','ADMIN','SUPPORT']);
 if(!organizationId||organizationId.length>100||reason.trim().length<5||reason.length>500)throw new PlatformAccessError('Informe estabelecimento e justificativa.');
 return prisma.$transaction(async tx=>{
  const org=await tx.organization.findUnique({where:{id:organizationId},select:{id:true}});if(!org)throw new PlatformAccessError('Estabelecimento não encontrado.');
  if(driverId&&!await tx.driver.findFirst({where:{id:driverId,organizationId},select:{id:true}}))throw new PlatformAccessError('Entregador não pertence ao estabelecimento.');
  const now=Date.now();const grant:SupportGrant={id:randomUUID(),operatorId:ctx.operatorId,organizationId,driverId,reason:reason.trim(),createdAt:new Date(now).toISOString(),expiresAt:new Date(now+15*60000).toISOString()};
  await tx.platformSetting.create({data:{key:key(grant.id),value:{...grant}}});
  await tx.platformAudit.create({data:{operatorId:ctx.operatorId,organizationId,action:'SUPPORT_ACCESS_CREATED',resourceType:'SupportAccess',resourceId:grant.id,reason:grant.reason,details:{driverId,expiresAt:grant.expiresAt,readOnly:true}}});
  return grant;
 });
}
export async function revokeSupportAccess(id:string){
 const ctx=await requirePlatformRole(['OWNER','ADMIN','SUPPORT']);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT key FROM "PlatformSetting" WHERE key = ${key(id)} FOR UPDATE`;
  const record=await tx.platformSetting.findUnique({where:{key:key(id)}});const grant=grantValue(record?.value);
  if(grant.operatorId!==ctx.operatorId&&ctx.role!=='OWNER')throw new PlatformAccessError('Acesso pertence a outro operador.');
  if(grant.revokedAt)return;
  await tx.platformSetting.update({where:{key:key(id)},data:{value:{...grant,revokedAt:new Date().toISOString()}}});
  await tx.platformAudit.create({data:{operatorId:ctx.operatorId,organizationId:grant.organizationId,action:'SUPPORT_ACCESS_REVOKED',resourceType:'SupportAccess',resourceId:id,reason:'Acesso encerrado pelo operador autorizado.'}});
 });
}
export async function getSupportSnapshot(id:string){
 const ctx=await requirePlatformRole(['OWNER','ADMIN','SUPPORT']);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT key FROM "PlatformSetting" WHERE key = ${key(id)} FOR UPDATE`;
  const record=await tx.platformSetting.findUnique({where:{key:key(id)}});const grant=grantValue(record?.value);
  if(grant.operatorId!==ctx.operatorId||grant.revokedAt||Date.parse(grant.expiresAt)<=Date.now())throw new PlatformAccessError('Acesso expirado, revogado ou pertencente a outro operador.');
  const organization=await tx.organization.findUnique({where:{id:grant.organizationId},select:{id:true,name:true,slug:true,status:true,storeStatus:true,_count:{select:{orders:true,products:true,drivers:true}}}});
  if(!organization)throw new PlatformAccessError('Estabelecimento indisponível.');
  const [orders,drivers]=await Promise.all([
   tx.order.findMany({where:{organizationId:grant.organizationId,...(grant.driverId?{driverId:grant.driverId}:{})},orderBy:{createdAt:'desc'},take:30,select:{id:true,displayId:true,status:true,createdAt:true,total:true,driverId:true}}),
   tx.driver.findMany({where:{organizationId:grant.organizationId,...(grant.driverId?{id:grant.driverId}:{})},take:50,select:{id:true,name:true,status:true,active:true}}),
  ]);
  await tx.platformAudit.create({data:{operatorId:ctx.operatorId,organizationId:grant.organizationId,action:'SUPPORT_ACCESS_VIEWED',resourceType:'SupportAccess',resourceId:id,reason:grant.reason,details:{driverId:grant.driverId,readOnly:true}}});
  return {grant,organization,orders,drivers};
 });
}
