import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma,toNumber } from '@/lib/db';
import { withOrganizationTransaction } from './transaction';
import { growthState,campaignEligibility,campaignBenefit,campaignSchema,pointsBalance,earnedPoints,GROWTH_EVENT_LIMIT,type GrowthState } from '@/lib/growth';
import { OperationError } from '@/lib/operation-error';

async function read(tx:Prisma.TransactionClient,organizationId:string){const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});return {settings:org.settings&&typeof org.settings==='object'&&!Array.isArray(org.settings)?org.settings as Prisma.JsonObject:{},state:growthState(org.settings)};}
async function save(tx:Prisma.TransactionClient,organizationId:string,settings:Prisma.JsonObject,state:GrowthState){await tx.organization.update({where:{id:organizationId},data:{settings:{...settings,growth:state as unknown as Prisma.InputJsonValue}}});}
export async function getGrowth(organizationId:string){const org=await prisma.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});return growthState(org.settings);}
export async function updateGrowth(organizationId:string,work:(state:GrowthState)=>void|Promise<void>){return withOrganizationTransaction(organizationId,async tx=>{const {settings,state}=await read(tx,organizationId);await work(state);await save(tx,organizationId,settings,state);});}
export async function getCampaignCustomers(organizationId:string){
 const customers=await prisma.customer.findMany({where:{organizationId},take:1000,orderBy:{name:'asc'},select:{id:true,name:true,createdAt:true,orders:{where:{status:'DELIVERED'},take:1,orderBy:{createdAt:'desc'},select:{createdAt:true}}}});
 return customers.map(c=>({id:c.id,name:c.name,createdAt:c.createdAt,lastOrderAt:c.orders[0]?.createdAt??null}));
}
export async function recordCampaignContact(organizationId:string,userId:string,campaignId:string,customerId:string){return withOrganizationTransaction(organizationId,async tx=>{
 const {settings,state}=await read(tx,organizationId);const campaign=state.campaigns.find(c=>c.id===campaignId);if(!campaign)throw new OperationError('Campanha não encontrada.');
 const customer=await tx.customer.findFirst({where:{id:customerId,organizationId},select:{id:true,createdAt:true,orders:{where:{status:'DELIVERED'},take:1,orderBy:{createdAt:'desc'},select:{createdAt:true}}}});if(!customer)throw new OperationError('Cliente não encontrado.');
 const error=campaignEligibility(campaign,{...customer,lastOrderAt:customer.orders[0]?.createdAt??null},state);if(error)throw new OperationError(error);
 if(state.contacts.length>=GROWTH_EVENT_LIMIT)throw new OperationError('Limite de histórico de contatos atingido. Nenhum registro foi apagado.');
 state.contacts.push({id:randomUUID(),campaignId,customerId,createdAt:new Date().toISOString(),actorId:userId});await save(tx,organizationId,settings,state);
});}
/** Hook called INSIDE the same transaction that updates a tenant order status. */
export async function syncOrderLoyalty(tx:Prisma.TransactionClient,organizationId:string,orderId:string){return withOrganizationTransaction(organizationId,async transaction=>{
 const order=await transaction.order.findFirst({where:{id:orderId,organizationId},select:{id:true,status:true,customerId:true,total:true,deliveryFee:true,deliveredAt:true}});if(!order?.customerId)return;
 const {settings,state}=await read(transaction,organizationId);const earn=state.ledger.find(e=>e.key===`${orderId}:earn`);
 if(order.status==='CANCELLED'&&!earn){await transaction.notification.updateMany({where:{id:`loyalty-pending:${orderId}`,organizationId},data:{read:true}});return;}
 if(order.status==='CANCELLED'&&earn&&!state.ledger.some(e=>e.key===`${orderId}:reverse`)){
  state.ledger.push({id:randomUUID(),key:`${orderId}:reverse`,orderId,customerId:order.customerId,points:-earn.points,kind:'REVERSE',createdAt:new Date().toISOString(),description:'Estorno de pedido cancelado'});
 }else if(order.status==='DELIVERED'&&state.loyalty.enabled&&!earn){
  if(state.loyalty.activatedAt&&order.deliveredAt&&order.deliveredAt<new Date(state.loyalty.activatedAt))return;
  const points=earnedPoints(toNumber(order.total),toNumber(order.deliveryFee),state.loyalty.pointsPerReal);
  if(points<=0)return;
  if(state.ledger.length>=GROWTH_EVENT_LIMIT){
   await transaction.notification.upsert({where:{id:`loyalty-pending:${orderId}`},create:{id:`loyalty-pending:${orderId}`,organizationId,type:'SYSTEM',title:'Crédito de pontos pendente',message:`${points} pontos aguardam regularização do histórico do programa. A entrega foi concluída normalmente.`,href:`/app/pedidos?pedido=${orderId}`},update:{}});
   return {pending:true};
  }
  state.ledger.push({id:randomUUID(),key:`${orderId}:earn`,orderId,customerId:order.customerId,points,kind:'EARN',createdAt:new Date().toISOString(),description:'Pedido entregue'});
  await transaction.notification.updateMany({where:{id:`loyalty-pending:${orderId}`,organizationId},data:{read:true}});
 }else return;
 await save(transaction,organizationId,settings,state);
},tx);}
export async function redeemLoyalty(organizationId:string,userId:string,customerId:string,key:string){return withOrganizationTransaction(organizationId,async tx=>{
 await tx.customer.findFirstOrThrow({where:{id:customerId,organizationId},select:{id:true}});
 const {settings,state}=await read(tx,organizationId);
 const previous=state.ledger.find(e=>e.key===`redeem:${key}`);if(previous){if(previous.customerId!==customerId)throw new OperationError('Identificação de resgate já utilizada.');return;}
 if(state.ledger.length>=GROWTH_EVENT_LIMIT)throw new OperationError('Limite do histórico de pontos atingido.');
 if(!state.loyalty.enabled||!state.loyalty.rewardName)throw new OperationError('Configure uma recompensa e ative o programa.');
 if(pointsBalance(state.ledger,customerId)<state.loyalty.rewardPoints)throw new OperationError('Saldo insuficiente para resgate.');
 state.ledger.push({id:randomUUID(),key:`redeem:${key}`,customerId,points:-state.loyalty.rewardPoints,kind:'REDEEM',createdAt:new Date().toISOString(),actorId:userId,description:state.loyalty.rewardName});await save(tx,organizationId,settings,state);
});}

/** Reserve a promotion only within the order-creation transaction. No browser price is accepted. */
export async function applyCampaignBenefit(tx:Prisma.TransactionClient,organizationId:string,customerId:string,subtotal:number,deliveryFee:number,couponCode:string|undefined,requestKey:string){
 return withOrganizationTransaction(organizationId,async transaction=>{
  if(!Number.isFinite(subtotal)||!Number.isFinite(deliveryFee)||subtotal<0||deliveryFee<0)throw new OperationError('Valores da compra inválidos.');
  if(!requestKey||requestKey.length>200)throw new OperationError('Identificação da compra inválida.');
  const {settings,state}=await read(transaction,organizationId);
  const previous=state.uses.find(u=>u.key===requestKey);
  if(previous){if(previous.customerId!==customerId)throw new OperationError('Identificação da compra já utilizada.');return {discount:previous.discount,deliveryFee:previous.deliveryFee,campaignId:previous.campaignId};}
  const code=couponCode?.trim().toUpperCase()??'';
  if(!state.campaigns.length&&!code)return {discount:0,deliveryFee,campaignId:null};
  const customer=await transaction.customer.findFirst({where:{id:customerId,organizationId},select:{id:true,createdAt:true,orders:{where:{status:'DELIVERED'},take:1,orderBy:{createdAt:'desc'},select:{createdAt:true}}}});
  if(!customer)throw new OperationError('Cliente não encontrado.');
  const usageState={...state,contacts:state.uses.map(u=>({id:u.key,campaignId:u.campaignId,customerId:u.customerId,createdAt:u.createdAt,actorId:''}))};
  const applicable=state.campaigns.filter(c=>campaignSchema.safeParse(c).success&&(code?c.coupon===code:c.type!=='COUPON'&&c.type!=='CUSTOM')&&!campaignEligibility(c,{...customer,lastOrderAt:customer.orders[0]?.createdAt??null},usageState));
  const selected=applicable.map(c=>({campaign:c,benefit:campaignBenefit(c,subtotal,deliveryFee)})).filter(v=>v.benefit.discount+v.benefit.deliveryDiscount>0).sort((a,b)=>(b.benefit.discount+b.benefit.deliveryDiscount)-(a.benefit.discount+a.benefit.deliveryDiscount))[0];
  if(!selected){if(code)throw new OperationError('Cupom inválido, vencido ou não disponível para esta compra.');return {discount:0,deliveryFee,campaignId:null};}
  if(state.uses.length>=GROWTH_EVENT_LIMIT)throw new OperationError('Limite de utilizações de campanhas atingido.');
  const benefit={discount:selected.benefit.discount,deliveryFee:Math.max(0,Math.round((deliveryFee-selected.benefit.deliveryDiscount)*100)/100),campaignId:selected.campaign.id};
  state.uses.push({key:requestKey,customerId,...benefit,originalDeliveryFee:deliveryFee,createdAt:new Date().toISOString()});await save(transaction,organizationId,settings,state);return benefit;
 },tx);
}
