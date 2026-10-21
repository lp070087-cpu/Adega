'use server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePlatformRole, PlatformAccessError, type PlatformContext } from '@/lib/platform/auth';
import { planSchema, contractSchema, commercialPlanData, requiredDate } from '@/lib/platform/rules';
import { ADEGA_COMMERCIAL_PLAN } from '@/lib/commercial-plan';

export type PlatformActionState = { ok:boolean; message:string };
const reasonSchema=z.string().trim().min(5,'Informe um motivo com pelo menos 5 caracteres.').max(500);
const idSchema=z.string().min(1).max(100);
function value(form:FormData,key:string){return String(form.get(key)??'');}
function checked(form:FormData,key:string){return form.get(key)==='on';}
function audit(tx:Prisma.TransactionClient,ctx:PlatformContext,action:string,type:string,id:string,reason:string,organizationId?:string,details?:Prisma.InputJsonObject){return tx.platformAudit.create({data:{operatorId:ctx.operatorId,action,resourceType:type,resourceId:id,reason,organizationId,details}});}
async function lock(tx:Prisma.TransactionClient,key:string){await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;}

export async function platformAction(_previous:PlatformActionState,form:FormData):Promise<PlatformActionState>{
 try {
  const action=value(form,'action');
  const ctx=await requirePlatformRole(action==='support'?['OWNER','ADMIN','SUPPORT']:action==='charge'||action==='payment'||action==='cancelCharge'?['OWNER','ADMIN','FINANCE']:action==='operator'||action==='settings'?['OWNER']:['OWNER','ADMIN']);
  if(!checked(form,'confirm')) return {ok:false,message:'Confirme a alteração antes de continuar.'};
  const reason=reasonSchema.parse(value(form,'reason'));
  await prisma.$transaction(async tx=>{
   if(action==='publishPlan'){
    await lock(tx,'platform:commercial-plan');
    const current=await tx.plan.findUnique({where:{slug:ADEGA_COMMERCIAL_PLAN.slug}});
    const previous=current?.features&&typeof current.features==='object'&&!Array.isArray(current.features)?current.features as Prisma.JsonObject:{};
    const saved={name:ADEGA_COMMERCIAL_PLAN.name,price:new Prisma.Decimal(ADEGA_COMMERCIAL_PLAN.monthlyPrice),active:true,features:{...previous,features:[...ADEGA_COMMERCIAL_PLAN.features],commercial:{description:ADEGA_COMMERCIAL_PLAN.description,annualPrice:null}}};
    const plan=await tx.plan.upsert({where:{slug:ADEGA_COMMERCIAL_PLAN.slug},create:{slug:ADEGA_COMMERCIAL_PLAN.slug,...saved},update:saved});
    await tx.plan.updateMany({where:{id:{not:plan.id},active:true},data:{active:false}});
    await audit(tx,ctx,'COMMERCIAL_PLAN_PUBLISHED','Plan',plan.id,reason,undefined,{price:'119.00',preservedContracts:true});
   }else if(action==='plan'){
    const data=planSchema.parse({id:value(form,'id')||undefined,name:value(form,'name'),slug:value(form,'slug'),description:value(form,'description'),price:value(form,'price'),annualPrice:value(form,'annualPrice'),maxUsers:value(form,'maxUsers'),maxDrivers:value(form,'maxDrivers'),active:checked(form,'active'),features:value(form,'features')});
    if(data.active&&(data.name!==ADEGA_COMMERCIAL_PLAN.name||data.slug!==ADEGA_COMMERCIAL_PLAN.slug||data.price!==ADEGA_COMMERCIAL_PLAN.monthlyPrice||data.annualPrice!==''))throw new PlatformAccessError('A oferta atual é Del Flash Completo por R$ 119,00 mensais, sem modalidade anual.');
    const previous=data.id?await tx.plan.findUniqueOrThrow({where:{id:data.id}}):null;
    const existing=previous?.features && typeof previous.features==='object' && !Array.isArray(previous.features)?previous.features as Prisma.JsonObject:{};
    const saved={name:data.name,slug:data.slug,price:new Prisma.Decimal(data.price.toFixed(2)),maxUsers:data.maxUsers,maxDrivers:data.maxDrivers,active:data.active,features:{...existing,features:data.features.split('\n').map(s=>s.trim()).filter(Boolean),commercial:{description:data.description,annualPrice:data.annualPrice===''?null:data.annualPrice.toFixed(2)}}};
    const plan=previous?await tx.plan.update({where:{id:previous.id},data:saved}):await tx.plan.create({data:saved});
    await audit(tx,ctx,previous?'PLAN_UPDATED':'PLAN_CREATED','Plan',plan.id,reason,undefined,{previousPrice:previous?.price.toString()??null,price:plan.price.toString(),previousActive:previous?.active??null,active:plan.active,maxUsers:plan.maxUsers,maxDrivers:plan.maxDrivers});
   } else if(action==='contract'){
    const data=contractSchema.parse({organizationId:value(form,'organizationId'),planId:value(form,'planId'),status:value(form,'status'),period:value(form,'period'),startedAt:value(form,'startedAt'),dueAt:value(form,'dueAt'),trialEndsAt:value(form,'trialEndsAt'),enforceAccess:checked(form,'enforceAccess'),graceDays:value(form,'graceDays')});
    await lock(tx,`contract:${data.organizationId}`);
    await tx.organization.findUniqueOrThrow({where:{id:data.organizationId},select:{id:true}});
    const plan=await tx.plan.findUniqueOrThrow({where:{id:data.planId}});
    const previous=await tx.platformContract.findUnique({where:{organizationId:data.organizationId}});
    if((!previous||previous.planId!==plan.id)&&plan.slug!==ADEGA_COMMERCIAL_PLAN.slug)throw new PlatformAccessError('Novas contratações devem utilizar o plano Del Flash Completo.');
    if(!plan.active && (!previous || previous.planId!==plan.id)) throw new PlatformAccessError('Plano desativado não pode receber novas assinaturas.');
    const reprice=checked(form,'reprice');
    const preserveAmount=previous&&previous.planId===plan.id&&previous.period===data.period&&!reprice;
    const annual=commercialPlanData(plan.features).annualPrice;
    if(!preserveAmount&&data.period==='ANNUAL' && annual===null) throw new PlatformAccessError('Este plano não oferece contratação anual.');
    const amount=preserveAmount?previous.amount:data.period==='ANNUAL'?new Prisma.Decimal(annual!):plan.price;
    const saved={...data,amount,startedAt:new Date(`${data.startedAt}T00:00:00-03:00`),dueAt:new Date(`${data.dueAt}T23:59:59-03:00`),trialEndsAt:data.trialEndsAt?new Date(`${data.trialEndsAt}T23:59:59-03:00`):null,cancelledAt:data.status==='CANCELLED'?(previous?.cancelledAt??new Date()):null};
    const contract=await tx.platformContract.upsert({where:{organizationId:data.organizationId},create:saved,update:saved});
    await audit(tx,ctx,previous?'CONTRACT_UPDATED':'CONTRACT_CREATED','PlatformContract',contract.id,reason,data.organizationId,{previousStatus:previous?.status??null,previousDueAt:previous?.dueAt?.toISOString()??null,previousPlanId:previous?.planId??null,previousPeriod:previous?.period??null,status:data.status,planId:plan.id,period:data.period,previousAmount:previous?.amount.toString()??null,amount:amount.toString(),dueAt:saved.dueAt.toISOString(),enforceAccess:data.enforceAccess});
   } else if(action==='charge'){
    const contractId=idSchema.parse(value(form,'contractId'));
    const competence=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(value(form,'competence'));
    const due=requiredDate.parse(value(form,'dueAt'));
    const dueAt=new Date(`${due}T23:59:59-03:00`); if(Number.isNaN(dueAt.getTime())) throw new PlatformAccessError('Vencimento inválido.');
    const contract=await tx.platformContract.findUniqueOrThrow({where:{id:contractId}});
    if(['CANCELLED','TRIAL'].includes(contract.status))throw new PlatformAccessError('Não é permitido emitir cobrança para teste ou contrato cancelado.');
    const charge=await tx.saaSCharge.create({data:{contractId,organizationId:contract.organizationId,competence,amount:contract.amount,dueAt,reference:value(form,'reference').slice(0,200)||null}});
    await audit(tx,ctx,'CHARGE_CREATED','SaaSCharge',charge.id,reason,contract.organizationId,{amount:charge.amount.toString(),competence});
   } else if(action==='payment'){
    const id=idSchema.parse(value(form,'id')); await lock(tx,`charge:${id}`);
    const charge=await tx.saaSCharge.findUniqueOrThrow({where:{id}});
    if(charge.status!=='PENDING')throw new PlatformAccessError('A cobrança já foi recebida ou cancelada.');
    const paymentMethod=z.enum(['PIX','CASH','BANK_TRANSFER','CREDIT_CARD','DEBIT_CARD','OTHER']).parse(value(form,'paymentMethod'));
    const paidInput=requiredDate.parse(value(form,'paidAt'));
    const paidAt=new Date(`${paidInput}T00:00:00-03:00`); if(Number.isNaN(paidAt.getTime())||paidAt>new Date()) throw new PlatformAccessError('Data de recebimento inválida ou futura.');
    await tx.saaSCharge.update({where:{id},data:{status:'PAID',paymentMethod,paidAt,reference:value(form,'reference').slice(0,200)||null}});
    await audit(tx,ctx,'PAYMENT_RECORDED','SaaSCharge',id,reason,charge.organizationId,{amount:charge.amount.toString(),paymentMethod,paidAt:paidAt.toISOString()});
   } else if(action==='cancelCharge'){
    const id=idSchema.parse(value(form,'id'));await lock(tx,`charge:${id}`);
    const charge=await tx.saaSCharge.findUniqueOrThrow({where:{id}});
    if(charge.status!=='PENDING')throw new PlatformAccessError('Somente cobranças pendentes podem ser canceladas.');
    await tx.saaSCharge.update({where:{id},data:{status:'CANCELLED'}});
    await audit(tx,ctx,'CHARGE_CANCELLED','SaaSCharge',id,reason,charge.organizationId,{amount:charge.amount.toString()});
   } else if(action==='operator'){
    await lock(tx,'platform:operators');
    const userId=idSchema.parse(value(form,'userId')); const role=z.enum(['OWNER','ADMIN','SUPPORT','FINANCE']).parse(value(form,'role'));const active=checked(form,'active');
    const user=await tx.user.findUniqueOrThrow({where:{id:userId},select:{active:true}});
    if(!user.active)throw new PlatformAccessError('A conta precisa estar ativa.');
    const previous=await tx.platformOperator.findUnique({where:{userId}});
    if(previous?.role==='OWNER'&&previous.active&&(!active||role!=='OWNER')&&await tx.platformOperator.count({where:{role:'OWNER',active:true,user:{active:true}}})<=1)throw new PlatformAccessError('Mantenha ao menos um proprietário central ativo.');
    const operator=await tx.platformOperator.upsert({where:{userId},create:{userId,role,active},update:{role,active}});
    await audit(tx,ctx,'OPERATOR_UPDATED','PlatformOperator',operator.id,reason,undefined,{userId,role,active});
   } else if(action==='settings'){
    const contact=z.string().trim().email().or(z.literal('')).parse(value(form,'supportEmail'));
    const name=z.string().trim().min(2).max(100).parse(value(form,'platformName'));
    await tx.platformSetting.upsert({where:{key:'public'},create:{key:'public',value:{supportEmail:contact,platformName:name}},update:{value:{supportEmail:contact,platformName:name}}});
    await audit(tx,ctx,'SETTINGS_UPDATED','PlatformSetting','public',reason);
   } else if(action==='support'){
    const organizationId=idSchema.parse(value(form,'organizationId'));const title=z.string().trim().min(3).max(200).parse(value(form,'title'));const status=z.enum(['OPEN','IN_PROGRESS','RESOLVED']).parse(value(form,'status'));const notes=z.string().trim().max(4000).parse(value(form,'notes'));
    await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{id:true}});
    const id=value(form,'id');
    const support=id?await tx.platformSupportCase.update({where:{id,organizationId},data:{title,status,notes}}):await tx.platformSupportCase.create({data:{organizationId,title,status,notes}});
    await audit(tx,ctx,'SUPPORT_UPDATED','PlatformSupportCase',support.id,reason,organizationId);
   } else { throw new PlatformAccessError('Operação inválida.'); }
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  revalidatePath('/admin','layout');
  return {ok:true,message:'Alteração registrada.'};
 } catch(error){
  if(error instanceof z.ZodError)return {ok:false,message:error.issues[0]?.message??'Confira os campos.'};
  if(error instanceof PlatformAccessError)return {ok:false,message:error.message};
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')return {ok:false,message:'Já existe um registro com esta identificação ou competência.'};
  return {ok:false,message:'Não foi possível concluir a alteração. Atualize a página e tente novamente.'};
 }
}
