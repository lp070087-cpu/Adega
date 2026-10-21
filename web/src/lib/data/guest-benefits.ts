import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withOrganizationTransaction } from './transaction';
import { growthState } from '@/lib/growth';
import { OperationError } from '@/lib/operation-error';
const capability=z.object({slug:z.string().min(1).max(100),orderId:z.string().min(20).max(100)});
/** Receipt IDs are bearer capabilities. Never resolve a consumer by phone. */
export async function getGuestBenefits(slug:string,orderId:string){
 const parsed=capability.safeParse({slug,orderId});if(!parsed.success)return null;
 return prisma.order.findFirst({where:{id:parsed.data.orderId,organization:{slug:parsed.data.slug},customerId:{not:null}},select:{id:true,customerId:true,organizationId:true,organization:{select:{slug:true,name:true,settings:true}},customer:{select:{id:true,createdAt:true,orders:{where:{status:'DELIVERED'},take:1,orderBy:{createdAt:'desc'},select:{createdAt:true}}}}}});
}
export async function setGuestCampaignPreference(slug:string,orderId:string,optOut:boolean){
 const order=await getGuestBenefits(slug,orderId);if(!order?.customerId)throw new OperationError('Acesso ao benefício indisponível.');
 await withOrganizationTransaction(order.organizationId,async tx=>{
  const current=await tx.order.findFirst({where:{id:orderId,organizationId:order.organizationId,customerId:order.customerId},select:{id:true}});if(!current)throw new OperationError('Acesso indisponível.');
  const org=await tx.organization.findUniqueOrThrow({where:{id:order.organizationId},select:{settings:true}});
  const settings=org.settings&&typeof org.settings==='object'&&!Array.isArray(org.settings)?org.settings as Prisma.JsonObject:{};
  const state=growthState(settings);state.consents[order.customerId!]={optOut,updatedAt:new Date().toISOString(),actorId:`receipt:${orderId}`};
  await tx.organization.update({where:{id:order.organizationId},data:{settings:{...settings,growth:state as unknown as Prisma.InputJsonValue}}});
 });
}
