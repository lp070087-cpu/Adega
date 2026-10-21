import { z } from 'zod';
export const campaignSchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(3).max(100),type:z.enum(['TURBO','DISCOUNT','COUPON','FREE_SHIPPING','CUSTOM']),status:z.enum(['DRAFT','ACTIVE','PAUSED']),startsAt:z.string().datetime(),endsAt:z.string().datetime(),inactiveDays:z.number().int().min(0).max(730),minimumOrder:z.number().finite().min(0).max(100000),discountPercent:z.number().finite().min(0).max(100),fixedDiscount:z.number().finite().min(0).max(10000),coupon:z.string().trim().toUpperCase().max(40).regex(/^[A-Z0-9_-]*$/),conditions:z.string().trim().min(5).max(1000),perCustomerLimit:z.number().int().min(1).max(100),frequencyHours:z.number().int().min(24).max(8760),audienceLimit:z.number().int().min(1).max(1000)}).refine(v=>new Date(v.endsAt)>new Date(v.startsAt),'A validade deve terminar depois do início.').refine(v=>v.type!=='COUPON'||v.coupon.length>=3,'Informe um cupom válido.');
export type Campaign=z.infer<typeof campaignSchema> & {id:string;createdBy:string;createdAt:string};
export const loyaltySchema=z.object({enabled:z.boolean(),pointsPerReal:z.number().finite().positive().max(100),rewardPoints:z.number().int().min(1).max(1000000),rewardName:z.string().trim().max(150),terms:z.string().trim().max(2000)}).refine(v=>!v.enabled||v.terms.length>=10,'Informe as regras do programa antes de ativar.');
export type LoyaltyEntry={id:string;key:string;customerId:string;orderId?:string;points:number;kind:'EARN'|'REVERSE'|'REDEEM';createdAt:string;actorId?:string;description:string};
export const GROWTH_EVENT_LIMIT=10000;
export type CampaignUse={key:string;campaignId:string;customerId:string;discount:number;deliveryFee:number;originalDeliveryFee:number;createdAt:string};
export type GrowthState={campaigns:Campaign[];consents:Record<string,{optOut:boolean;updatedAt:string;actorId:string}>;contacts:{id:string;campaignId:string;customerId:string;createdAt:string;actorId:string}[];uses:CampaignUse[];loyalty:z.infer<typeof loyaltySchema>&{activatedAt?:string};ledger:LoyaltyEntry[]};
export function growthState(settings:unknown):GrowthState{
 const s=settings&&typeof settings==='object'&&!Array.isArray(settings)?settings as Record<string,unknown>:{};
 const g=s.growth&&typeof s.growth==='object'&&!Array.isArray(s.growth)?s.growth as Partial<GrowthState>:{};
 return {campaigns:Array.isArray(g.campaigns)?g.campaigns:[],consents:g.consents&&typeof g.consents==='object'?g.consents:{},contacts:Array.isArray(g.contacts)?g.contacts:[],uses:Array.isArray(g.uses)?g.uses:[],loyalty:g.loyalty??{enabled:false,pointsPerReal:1,rewardPoints:100,rewardName:'',terms:''},ledger:Array.isArray(g.ledger)?g.ledger:[]};
}
export function pointsBalance(ledger:LoyaltyEntry[],customerId:string){return ledger.filter(e=>e.customerId===customerId).reduce((sum,e)=>sum+e.points,0);}
export function earnedPoints(total:number,deliveryFee:number,pointsPerReal:number){return Math.floor(Math.max(0,Math.round(total*100)-Math.round(deliveryFee*100))*pointsPerReal/100+1e-8);}
export function campaignEligibility(c:Campaign,customer:{id:string;createdAt:Date;lastOrderAt:Date|null},state:GrowthState,now=new Date()){
 if(c.status!=='ACTIVE')return 'Campanha inativa';
 if(now<new Date(c.startsAt)||now>new Date(c.endsAt))return 'Fora da validade';
 if(state.consents[customer.id]?.optOut)return 'Cliente não deseja contatos';
 const days=(now.getTime()-(customer.lastOrderAt??customer.createdAt).getTime())/86400000;
 if(days<c.inactiveDays)return 'Fora do período de inatividade';
 const previous=state.contacts.filter(e=>e.customerId===customer.id);
 if(previous.some(e=>now.getTime()-new Date(e.createdAt).getTime()<c.frequencyHours*3600000))return 'Limite de frequência';
 if(previous.filter(e=>e.campaignId===c.id).length>=c.perCustomerLimit)return 'Limite individual atingido';
 if(state.contacts.filter(e=>e.campaignId===c.id).length>=c.audienceLimit)return 'Limite da campanha atingido';
 return null;
}
export function campaignBenefit(c:Campaign,subtotal:number,deliveryFee:number){
 if(subtotal<c.minimumOrder||c.type==='CUSTOM')return {discount:0,deliveryDiscount:0};
 return {discount:c.type==='FREE_SHIPPING'?0:Math.min(subtotal,Math.round((subtotal*c.discountPercent/100+c.fixedDiscount)*100)/100),deliveryDiscount:c.type==='FREE_SHIPPING'?Math.max(0,deliveryFee):0};
}
