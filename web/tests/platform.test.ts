import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { Prisma } from '@prisma/client';
import * as rules from '../src/lib/platform/rules';

// Execute the real server modules with isolated imports. No database or network.
function isolated(file:string,imports:Record<string,unknown>){
 const source=readFileSync(resolve(file),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{} as Record<string,any>};
 const require=(name:string)=>{if(name in imports)return imports[name];throw new Error(`Unexpected dependency: ${name}`);};
 new Function('require','module','exports',code)(require,module,module.exports);return module.exports;
}
function authHarness({enabled=true,session=true,ready=true,active=true,operator=null as null|{id:string;role:string;active:boolean}}={}){
 let queries=0;
 const auth=isolated('src/lib/platform/auth.ts',{'server-only':{},'@/lib/auth/index':{auth:async()=>session?{user:{id:'user-a',role:'PLATFORM_ADMIN',organizationId:'tenant-a'}}:null},'@/lib/db':{prisma:{$queryRaw:async()=>{queries++;return [{ready}];},user:{findUnique:async()=>({active})},platformOperator:{findUnique:async()=>operator}}},'next/navigation':{notFound:()=>{throw Error('404');},redirect:()=>{throw Error('redirect');}}});
 const previous=process.env.PLATFORM_ADMIN_ENABLED;process.env.PLATFORM_ADMIN_ENABLED=enabled?'true':'false';
 return {auth,queries:()=>queries,restore:()=>{if(previous===undefined)delete process.env.PLATFORM_ADMIN_ENABLED;else process.env.PLATFORM_ADMIN_ENABLED=previous;}};
}
test('central guard fails closed with flag off without any database query',async()=>{const h=authHarness({enabled:false});try{await assert.rejects(h.auth.requirePlatformOperator());assert.equal(h.queries(),0);}finally{h.restore();}});
test('tenant PLATFORM_ADMIN role does not grant platform operator authorization',async()=>{const h=authHarness();try{await assert.rejects(h.auth.requirePlatformOperator(),/restrito/);}finally{h.restore();}});
test('central guard refuses absent migration, revoked operator and disabled user',async()=>{for(const options of [{ready:false},{operator:{id:'op',role:'OWNER',active:false}},{active:false,operator:{id:'op',role:'OWNER',active:true}}]){const h=authHarness(options);try{await assert.rejects(h.auth.requirePlatformOperator());}finally{h.restore();}}});
test('active platform operator is read from database and role scope enforced',async()=>{const h=authHarness({operator:{id:'op',role:'SUPPORT',active:true}});try{assert.deepEqual(await h.auth.requirePlatformOperator(),{userId:'user-a',operatorId:'op',role:'SUPPORT'});await assert.rejects(h.auth.requirePlatformRole(['OWNER','ADMIN']));}finally{h.restore();}});
test('commercial validation rejects malformed values, fake calendar dates and reversed periods',()=>{
 for(const price of ['',-1,1.001,Infinity,NaN])assert.equal(rules.moneyInput.safeParse(price).success,false);
 const contract={organizationId:'org',planId:'plan',status:'ACTIVE',period:'MONTHLY',startedAt:'2026-10-01',dueAt:'2026-11-01',trialEndsAt:'',enforceAccess:false,graceDays:7};
 assert.equal(rules.contractSchema.safeParse(contract).success,true);
 for(const update of [{dueAt:'2026-09-01'},{dueAt:'2026-02-31'},{graceDays:-1},{status:'ANYTHING'},{trialEndsAt:'2026-09-30'}])assert.equal(rules.contractSchema.safeParse({...contract,...update}).success,false);
});
test('dashboard MRR uses active contract snapshots, annual normalized; received query only PAID current month',async()=>{
 const now=new Date('2026-10-19T15:00:00Z');const future=new Date('2027-01-01');const past=new Date('2026-01-01');const calls:any[]=[];
 const contracts=[{status:'ACTIVE',period:'MONTHLY',amount:new Prisma.Decimal('100'),dueAt:future,trialEndsAt:null,cancelledAt:null},{status:'ACTIVE',period:'ANNUAL',amount:new Prisma.Decimal('1200'),dueAt:future,trialEndsAt:null,cancelledAt:null},{status:'TRIAL',period:'MONTHLY',amount:new Prisma.Decimal('999'),dueAt:future,trialEndsAt:null,cancelledAt:null},{status:'ACTIVE',period:'MONTHLY',amount:new Prisma.Decimal('888'),dueAt:past,trialEndsAt:null,cancelledAt:null},{status:'CANCELLED',period:'MONTHLY',amount:new Prisma.Decimal('777'),dueAt:future,trialEndsAt:null,cancelledAt:past}];
 const db={organization:{count:async()=>0,findMany:async()=>[]},platformContract:{findMany:async()=>contracts},saaSCharge:{aggregate:async(q:any)=>{calls.push(q);return q.where.status==='PAID'?{_sum:{amount:new Prisma.Decimal('350')}}:{_sum:{amount:new Prisma.Decimal('100')},_count:1};}}};
 const data=isolated('src/lib/platform/data.ts',{'server-only':{},'@/lib/db':{prisma:db},'./auth':{requirePlatformRole:async()=>({})},'./rules':rules});
 const result=await data.getPlatformDashboard(now);assert.equal(result.mrr,200);assert.equal(String(result.received._sum.amount),'350');assert.equal(result.activeContracts.length,2);
 const paid=calls.find(q=>q.where.status==='PAID');assert.equal(paid.where.paidAt.gte.toISOString(),'2026-10-01T03:00:00.000Z');assert.equal(paid.where.paidAt.lte,now);
});
class AccessError extends Error {}
function actionHarness(role='OWNER',tx:Record<string,any>={}){
 let transactions=0;const audits:any[]=[];
 const realTx={...tx,platformAudit:{create:async(q:any)=>{audits.push(q.data);return q.data;}}};
 const actions=isolated('src/app/actions/platform.ts',{'zod':{z},'@prisma/client':{Prisma},'next/cache':{revalidatePath:()=>{}},'@/lib/db':{prisma:{$transaction:async(run:any)=>{transactions++;return run(realTx);}}},'@/lib/platform/auth':{requirePlatformRole:async(roles:string[])=>{if(!roles.includes(role))throw new AccessError('Acesso restrito.');return {userId:'user',operatorId:'op',role};},PlatformAccessError:AccessError},'@/lib/platform/rules':rules});
 return {run:actions.platformAction,transactions:()=>transactions,audits};
}
import { z } from 'zod';
function form(action:string,fields:Record<string,string>={}){const f=new FormData();Object.entries({action,confirm:'on',reason:'Alteração comercial validada',...fields}).forEach(([k,v])=>f.set(k,v));return f;}
test('support cannot create plans or manually confirm payments',async()=>{const h=actionHarness('SUPPORT');for(const action of ['plan','payment','operator']){const result=await h.run({ok:false,message:''},form(action));assert.equal(result.ok,false);}assert.equal(h.transactions(),0);});
test('sensitive changes require explicit confirmation and reason',async()=>{const h=actionHarness();const f=form('plan');f.delete('confirm');assert.equal((await h.run({},f)).ok,false);assert.equal(h.transactions(),0);});
test('charge uses contract price snapshot and organization, ignoring browser amount and tenant',async()=>{
 let created:any;const h=actionHarness('FINANCE',{platformContract:{findUniqueOrThrow:async()=>({id:'contract',organizationId:'real-org',amount:new Prisma.Decimal('89.90'),status:'ACTIVE'})},saaSCharge:{create:async(q:any)=>{created=q.data;return {id:'invoice',...q.data};}}});
 const result=await h.run({},form('charge',{contractId:'contract',competence:'2026-10',dueAt:'2026-10-30',amount:'0.01',organizationId:'attacker-org'}));assert.equal(result.ok,true);assert.equal(String(created.amount),'89.9');assert.equal(created.organizationId,'real-org');assert.equal(h.audits[0].action,'CHARGE_CREATED');
});
test('manual payment cannot be registered twice',async()=>{
 let updates=0;const h=actionHarness('FINANCE',{$queryRaw:async()=>[],saaSCharge:{findUniqueOrThrow:async()=>({status:'PAID'}),update:async()=>{updates++;}}});
 assert.equal((await h.run({},form('payment',{id:'charge',paymentMethod:'PIX',paidAt:'2026-01-01'}))).ok,false);assert.equal(updates,0);assert.equal(h.audits.length,0);
});
test('contract amount comes from selected real plan and change is audited',async()=>{
 let saved:any;const h=actionHarness('ADMIN',{$queryRaw:async()=>[],organization:{findUniqueOrThrow:async()=>({id:'org'})},plan:{findUniqueOrThrow:async()=>({id:'plan',active:true,price:new Prisma.Decimal('99'),features:{commercial:{annualPrice:'1000.00'}}})},platformContract:{findUnique:async()=>null,upsert:async(q:any)=>{saved=q.create;return {id:'contract',...q.create};}}});
 const result=await h.run({},form('contract',{organizationId:'org',planId:'plan',status:'ACTIVE',period:'ANNUAL',startedAt:'2026-01-01',dueAt:'2027-01-01',trialEndsAt:'',graceDays:'7',amount:'0.01'}));assert.equal(result.ok,true);assert.equal(String(saved.amount),'1000');assert.equal(saved.enforceAccess,false);assert.equal(h.audits[0].action,'CONTRACT_CREATED');
});

test('operator section permissions keep support away from financial and account data',()=>{
 for(const section of ['','financeiro','assinaturas','usuarios','auditoria','configuracoes'])assert.equal(rules.canPlatformSection('SUPPORT',section),false);
 for(const section of ['estabelecimentos','integracoes','suporte'])assert.equal(rules.canPlatformSection('SUPPORT',section),true);
 assert.equal(rules.canPlatformSection('FINANCE','financeiro'),true);assert.equal(rules.canPlatformSection('FINANCE','usuarios'),false);
});
test('editing only contract status preserves agreed snapshot after plan price changes',async()=>{
 for(const reprice of [false,true]){
  let saved:any;const h=actionHarness('OWNER',{$queryRaw:async()=>[],organization:{findUniqueOrThrow:async()=>({id:'org'})},plan:{findUniqueOrThrow:async()=>({id:'plan',active:true,price:new Prisma.Decimal('150'),features:null})},platformContract:{findUnique:async()=>({id:'c',organizationId:'org',planId:'plan',period:'MONTHLY',amount:new Prisma.Decimal('99'),status:'ACTIVE'}),upsert:async(q:any)=>{saved=q.update;return {id:'c',...q.update};}}});
  const f=form('contract',{organizationId:'org',planId:'plan',status:'SUSPENDED',period:'MONTHLY',startedAt:'2026-01-01',dueAt:'2027-01-01',trialEndsAt:'',graceDays:'7',...(reprice?{reprice:'on'}:{})});
  assert.equal((await h.run({},f)).ok,true);assert.equal(String(saved.amount),reprice?'150':'99');assert.equal(h.audits[0].details.previousAmount,'99');
 }
});
test('pending charge cancellation is audited and a paid charge cannot be cancelled',async()=>{
 for(const status of ['PENDING','PAID']){
  let updated=false;const h=actionHarness('FINANCE',{$queryRaw:async()=>[],saaSCharge:{findUniqueOrThrow:async()=>({id:'c',status,amount:new Prisma.Decimal('100'),organizationId:'org'}),update:async()=>{updated=true;}}});
  const result=await h.run({},form('cancelCharge',{id:'c'}));assert.equal(result.ok,status==='PENDING');assert.equal(updated,status==='PENDING');if(updated)assert.equal(h.audits[0].action,'CHARGE_CANCELLED');
 }
});
test('manual payment uses São Paulo calendar date, rejects invalid or future date',async()=>{
 for(const paidAt of ['2026-01-01','2026-02-31','2999-01-01']){
  let paid:any;const h=actionHarness('FINANCE',{$queryRaw:async()=>[],saaSCharge:{findUniqueOrThrow:async()=>({id:'c',status:'PENDING',amount:new Prisma.Decimal('100'),organizationId:'org'}),update:async(q:any)=>{paid=q.data.paidAt;}}});
  const result=await h.run({},form('payment',{id:'c',paymentMethod:'PIX',paidAt}));assert.equal(result.ok,paidAt==='2026-01-01');if(result.ok)assert.equal(paid.toISOString(),'2026-01-01T03:00:00.000Z');
 }
});
test('last usable global owner cannot be demoted or disabled',async()=>{
 for(const activeOwners of [1,2]){
  let updated=false;const h=actionHarness('OWNER',{$queryRaw:async()=>[],user:{findUniqueOrThrow:async()=>({active:true})},platformOperator:{findUnique:async()=>({id:'op2',role:'OWNER',active:true}),count:async()=>activeOwners,upsert:async()=>{updated=true;return {id:'op2'};}}});
  const result=await h.run({},form('operator',{userId:'owner2',role:'SUPPORT'}));assert.equal(result.ok,activeOwners===2);assert.equal(updated,activeOwners===2);
 }
});
test('plan edit keeps unrelated feature settings and records monetary change',async()=>{
 let updated:any;const h=actionHarness('ADMIN',{plan:{findUniqueOrThrow:async()=>({id:'plan',price:new Prisma.Decimal('50'),active:true,features:{delivery:true,features:['old'],commercial:{annualPrice:null}}}),update:async(q:any)=>{updated=q.data;return {id:'plan',...q.data};}}});
 const result=await h.run({},form('plan',{id:'plan',name:'Plano Profissional',slug:'profissional',description:'Operação completa',price:'79.90',annualPrice:'790',maxUsers:'10',maxDrivers:'5',active:'on',features:'Pedidos\nEntregas'}));assert.equal(result.ok,true);assert.equal(updated.features.delivery,true);assert.deepEqual(updated.features.features,['Pedidos','Entregas']);assert.equal(updated.features.commercial.annualPrice,'790.00');assert.equal(h.audits[0].details.previousPrice,'50');
});
