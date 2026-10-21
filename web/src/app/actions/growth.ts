'use server';
import {parseMoneyInput} from '@/lib/money-input';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePermission,toActionError } from '@/lib/auth/guards';
import { campaignSchema,loyaltySchema } from '@/lib/growth';
import { updateGrowth,recordCampaignContact,redeemLoyalty } from '@/lib/data/growth';
import { prisma } from '@/lib/db';
import { OperationError } from '@/lib/operation-error';
export type GrowthActionState={ok:boolean;message:string};
export async function growthAction(_previous:GrowthActionState,form:FormData):Promise<GrowthActionState>{
 try{
  const {organizationId,user}=await requirePermission('MANAGE_SETTINGS');
  const get=(key:string)=>String(form.get(key)??'');
  if(form.get('confirm')!=='on')throw new OperationError('Confirme os dados antes de continuar.');
  const action=get('action');
  if(action==='campaign'){
   const starts=get('startsAt'),ends=get('endsAt');
   const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v).getTime())&&new Date(v).toISOString().slice(0,10)===v;
   if(!validDate(starts)||!validDate(ends))throw new OperationError('Informe datas válidas para a campanha.');
   const data=campaignSchema.parse({id:get('id')||undefined,name:get('name'),type:get('type'),status:get('status'),startsAt:new Date(`${starts}T00:00:00-03:00`).toISOString(),endsAt:new Date(`${ends}T23:59:59-03:00`).toISOString(),inactiveDays:Number(get('inactiveDays')),minimumOrder:parseMoneyInput(get('minimumOrder'))??NaN,discountPercent:Number(get('discountPercent')),fixedDiscount:parseMoneyInput(get('fixedDiscount'))??NaN,coupon:get('coupon'),conditions:get('conditions'),perCustomerLimit:Number(get('perCustomerLimit')),frequencyHours:Number(get('frequencyHours')),audienceLimit:Number(get('audienceLimit'))});
   if(data.type==='TURBO')throw new OperationError('Configure Entrega Turbo na aba própria, sem descontos ou pontos.');
   await updateGrowth(organizationId,async state=>{
    if(data.coupon&&state.campaigns.some(c=>c.id!==data.id&&c.coupon===data.coupon))throw new OperationError('Este código de cupom já está cadastrado.');
    const previous=state.campaigns.find(c=>c.id===data.id);
    if(data.id&&!previous)throw new OperationError('Campanha não encontrada.');
    if(!previous&&state.campaigns.length>=100)throw new OperationError('Limite de 100 campanhas atingido. Reutilize campanhas existentes.');
    const campaign={...data,id:previous?.id??randomUUID(),createdAt:previous?.createdAt??new Date().toISOString(),createdBy:previous?.createdBy??user.id};
    state.campaigns=previous?state.campaigns.map(c=>c.id===previous.id?campaign:c):[...state.campaigns,campaign];
   });
  }else if(action==='loyalty'){
   const data=loyaltySchema.parse({enabled:get('enabled')==='on',pointsPerReal:Number(get('pointsPerReal')),rewardPoints:Number(get('rewardPoints')),rewardName:get('rewardName'),terms:get('terms')});
   await updateGrowth(organizationId,state=>{state.loyalty={...data,activatedAt:data.enabled?(state.loyalty.enabled?state.loyalty.activatedAt??new Date().toISOString():new Date().toISOString()):state.loyalty.activatedAt};});
  }else if(action==='contact'){
   await recordCampaignContact(organizationId,user.id,z.string().uuid().parse(get('campaignId')),z.string().min(1).parse(get('customerId')));
  }else if(action==='consent'){
   const customerId=z.string().min(1).parse(get('customerId'));
   if(!await prisma.customer.findFirst({where:{id:customerId,organizationId},select:{id:true}}))throw new OperationError('Cliente não encontrado.');
   await updateGrowth(organizationId,state=>{state.consents[customerId]={optOut:get('optOut')==='on',turboConsent:get('optOut')==='on'?false:state.consents[customerId]?.turboConsent??false,updatedAt:new Date().toISOString(),actorId:user.id};});
  }else if(action==='redeem'){
   await redeemLoyalty(organizationId,user.id,z.string().min(1).parse(get('customerId')),z.string().uuid().parse(get('requestKey')));
  }else throw new OperationError('Ação inválida.');
  revalidatePath('/app/campanhas');revalidatePath('/app/fidelidade');return {ok:true,message:'Alteração registrada.'};
 }catch(error){return {ok:false,message:error instanceof z.ZodError?error.issues[0]?.message??'Confira os campos.':toActionError(error).error};}
}
