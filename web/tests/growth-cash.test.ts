import assert from 'node:assert/strict';
import test from 'node:test';
import * as reconciliation from '../src/lib/cash-reconciliation';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { Prisma } from '@prisma/client';
import * as rules from '../src/lib/growth';
import * as handoffRules from '../src/lib/cash-handoff-state';
import { parseMoneyInput,formatMoneyInput } from '../src/lib/money-input';
class OperationError extends Error{}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as Record<string,any>};const output=ts.transpileModule(readFileSync(resolve(file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',output)((name:string)=>{if(name==='@/lib/cash-reconciliation')return reconciliation;if(name in imports)return imports[name];throw Error(`Unexpected dependency ${name}`);},module,module.exports);return module.exports;}
const campaign={id:'dc75ef2b-272d-4c10-b3a1-117817d4d770',name:'Clientes de volta',type:'COUPON',status:'ACTIVE',startsAt:'2020-01-01T00:00:00.000Z',endsAt:'2099-01-01T00:00:00.000Z',inactiveDays:30,minimumOrder:50,discountPercent:10,fixedDiscount:5,coupon:'VOLTE',conditions:'Válido nas condições informadas.',perCustomerLimit:1,frequencyHours:24,audienceLimit:100,createdBy:'actor',createdAt:'2026-01-01T00:00:00.000Z'} as rules.Campaign;
test('campaign validity, opt-out, inactivity, frequency and per-customer usage are enforced',()=>{
 const state=rules.growthState({});const customer={id:'c',createdAt:new Date('2020-01-01'),lastOrderAt:new Date('2026-09-01')};const now=new Date('2026-10-20');
 assert.equal(rules.campaignEligibility(campaign,customer,state,now),null);
 assert.equal(rules.campaignEligibility({...campaign,status:'PAUSED'},customer,state,now),'Campanha inativa');
 assert.equal(rules.campaignEligibility({...campaign,endsAt:'2026-10-19T00:00:00Z'},customer,state,now),'Fora da validade');
 state.consents.c={optOut:true,updatedAt:now.toISOString(),actorId:'a'};assert.equal(rules.campaignEligibility(campaign,customer,state,now),'Cliente não deseja contatos');delete state.consents.c;
 assert.equal(rules.campaignEligibility(campaign,{...customer,lastOrderAt:now},state,now),'Fora do período de inatividade');
 state.contacts.push({id:'x',customerId:'c',campaignId:campaign.id,createdAt:now.toISOString(),actorId:'a'});assert.equal(rules.campaignEligibility(campaign,customer,state,now),'Limite de frequência');
 state.contacts[0].createdAt='2026-09-01T00:00:00Z';assert.equal(rules.campaignEligibility(campaign,customer,state,now),'Limite individual atingido');
});
test('promotion math respects minimum and never discounts above order or shipping',()=>{
 assert.deepEqual(rules.campaignBenefit(campaign,40,10),{discount:0,deliveryDiscount:0});
 assert.deepEqual(rules.campaignBenefit(campaign,100,10),{discount:15,deliveryDiscount:0});
 assert.equal(rules.campaignBenefit({...campaign,discountPercent:100,fixedDiscount:100},50,10).discount,50);
 assert.deepEqual(rules.campaignBenefit({...campaign,type:'FREE_SHIPPING'},100,7),{discount:0,deliveryDiscount:7});
 assert.deepEqual(rules.campaignBenefit({...campaign,type:'CUSTOM'},100,7),{discount:0,deliveryDiscount:0});
});
function growthHarness(){
 let settings:any={untouched:{keep:true},growth:{...rules.growthState({}),campaigns:[campaign],loyalty:{enabled:true,pointsPerReal:1,rewardPoints:10,rewardName:'Recompensa',terms:'Condições verdadeiras.',activatedAt:'2026-01-01T00:00:00Z'}}};let order:any={id:'order',status:'DELIVERED',customerId:'c',total:110,deliveryFee:10,deliveredAt:new Date('2026-10-20')};
 const pending=new Map<string,unknown>();
 const tx:any={notification:{upsert:async(q:any)=>{pending.set(q.where.id,q.create);},updateMany:async()=>({count:0})},organization:{findUniqueOrThrow:async()=>({settings}),update:async(q:any)=>{settings=q.data.settings;}},order:{findFirst:async(q:any)=>{assert.equal(q.where.organizationId,'org');return order;}},customer:{findFirst:async(q:any)=>{assert.equal(q.where.organizationId,'org');return {id:'c',createdAt:new Date('2020-01-01'),orders:[]};},findFirstOrThrow:async()=>({id:'c'})}};
 const data=isolated('src/lib/data/growth.ts',{'server-only':{},'node:crypto':{randomUUID:()=>crypto.randomUUID()},'@prisma/client':{Prisma},'@/lib/db':{prisma:{},toNumber:Number},'./transaction':{withOrganizationTransaction:async(_id:string,work:any)=>work(tx)},'@/lib/growth':rules,'@/lib/operation-error':{OperationError}});
 return {data,tx,pending,settings:()=>settings,setOrder:(o:any)=>{order={...order,...o};}};
}
test('loyalty defaults off, excludes shipping, is idempotent and reverses cancellation even after disabling',async()=>{
 assert.equal(rules.growthState({}).loyalty.enabled,false);assert.equal(rules.earnedPoints(10.1,.1,1),10);
 const h=growthHarness();await h.data.syncOrderLoyalty(h.tx,'org','order');await h.data.syncOrderLoyalty(h.tx,'org','order');assert.equal(h.settings().growth.ledger.length,1);assert.equal(h.settings().growth.ledger[0].points,100);assert.equal(h.settings().untouched.keep,true);
 h.settings().growth.loyalty.enabled=false;h.setOrder({status:'CANCELLED'});await h.data.syncOrderLoyalty(h.tx,'org','order');await h.data.syncOrderLoyalty(h.tx,'org','order');assert.equal(h.settings().growth.ledger.length,2);assert.equal(rules.pointsBalance(h.settings().growth.ledger,'c'),0);
});
test('reward redemption is idempotent and cannot overdraw current balance',async()=>{const h=growthHarness();await h.data.syncOrderLoyalty(h.tx,'org','order');await h.data.redeemLoyalty('org','actor','c','request');await h.data.redeemLoyalty('org','actor','c','request');assert.equal(rules.pointsBalance(h.settings().growth.ledger,'c'),90);h.settings().growth.loyalty.rewardPoints=100;await assert.rejects(h.data.redeemLoyalty('org','actor','c','new'),/insuficiente/);});
test('checkout campaign reservation is tenant-bound, server-calculated and idempotent',async()=>{const h=growthHarness();const result=await h.data.applyCampaignBenefit(h.tx,'org','c',100,7,'volte','checkout-1');assert.deepEqual(result,{discount:15,deliveryFee:7,campaignId:campaign.id});const duplicate=await h.data.applyCampaignBenefit(h.tx,'org','c',100,7,'VOLTE','checkout-1');assert.deepEqual(duplicate,result);assert.equal(h.settings().growth.uses.length,1);await assert.rejects(h.data.applyCampaignBenefit(h.tx,'org','c',100,7,'VOLTE','checkout-2'),/inválido/);await assert.rejects(h.data.applyCampaignBenefit(h.tx,'org','other',100,7,'VOLTE','checkout-1'),/utilizada/);});
test('preactivation orders receive no retroactive points and ledger capacity never blocks delivery',async()=>{const h=growthHarness();h.setOrder({deliveredAt:new Date('2020-01-01')});await h.data.syncOrderLoyalty(h.tx,'org','order');assert.equal(h.settings().growth.ledger.length,0);h.settings().growth.ledger=Array.from({length:rules.GROWTH_EVENT_LIMIT},(_,i)=>({key:`existing-${i}`,customerId:'c',points:0}));h.setOrder({deliveredAt:new Date('2026-10-20')});await h.data.syncOrderLoyalty(h.tx,'org','order');await h.data.syncOrderLoyalty(h.tx,'org','order');assert.equal(h.settings().growth.ledger.length,rules.GROWTH_EVENT_LIMIT);assert.equal(h.pending.size,1);assert.match(JSON.stringify(h.pending.get('loyalty-pending:order')),/100 pontos/);});
test('cash drawer excludes card and Pix sales and noncash refunds',()=>{const data=isolated('src/lib/data/cash.ts',{'server-only':{},'@/lib/operation-error':{OperationError},'@/lib/db':{prisma:{},toNumber:Number},'@/lib/data/transaction':{},'@/lib/utils':{},'@/lib/cash-handoff-state':handoffRules});const total=data.summarizeShift(100,[{type:'SALE',paymentMethod:'CASH',amount:50},{type:'SALE',paymentMethod:'PIX',amount:90},{type:'SALE',paymentMethod:'CREDIT_CARD',amount:80},{type:'REFUND',paymentMethod:'PIX',amount:90},{type:'REFUND',paymentMethod:'CASH',amount:10},{type:'WITHDRAWAL',paymentMethod:'CASH',amount:20}]);assert.equal(total.expectedCash,120);assert.equal(total.pixSales,90);assert.equal(total.cardSales,80);assert.equal(total.nonCashRefunds,90);});
test('cash handoff can only be accepted by recipient after exact independent counting',async()=>{
 const entry:handoffRules.CashHandoff={id:'handoff',registerId:'register',registerName:'Caixa',shiftId:'old',fromUserId:'old-user',fromName:'Anterior',toUserId:'new-user',toName:'Novo',amount:150,expected:150,difference:0,notes:'Conferido',status:'PENDING',createdAt:'2026-10-20T10:00:00Z'};
 let settings:any={cashHandoffs:[entry],untouched:true};let opened=0;
 const tx:any={organization:{findUniqueOrThrow:async()=>({settings}),update:async(q:any)=>{settings=q.data.settings;}},organizationUser:{findUnique:async()=>({active:true,role:'CASHIER',user:{active:true}})},cashRegister:{findFirst:async()=>({id:'register'})},cashShift:{findFirst:async()=>null,create:async(q:any)=>{opened++;assert.equal(q.data.openedByUserId,'new-user');assert.equal(q.data.openingAmount,150);return {id:'new-shift'};}}};
 const data=isolated('src/lib/data/cash-handoff.ts',{'server-only':{},'node:crypto':{randomUUID:()=>crypto.randomUUID()},'@prisma/client':{Prisma},'@/lib/db':{prisma:{},toNumber:Number},'./transaction':{withOrganizationTransaction:async(_id:string,work:any)=>work(tx)},'./cash':{},'@/lib/cash-handoff-state':handoffRules,'@/lib/permissions':{can:()=>true},'@/lib/operation-error':{OperationError}});
 await assert.rejects(data.resolveCashHandoff('org','intruder',{id:'handoff',accept:true,amount:150,notes:'Conferido'}),/encontrada/);
 await assert.rejects(data.resolveCashHandoff('org','new-user',{id:'handoff',accept:true,amount:149,notes:'Conferido'}),/difere/);
 await data.resolveCashHandoff('org','new-user',{id:'handoff',accept:true,amount:150,notes:'Conferido'});assert.equal(opened,1);assert.equal(settings.cashHandoffs[0].newShiftId,'new-shift');assert.equal(settings.untouched,true);await assert.rejects(data.resolveCashHandoff('org','new-user',{id:'handoff',accept:true,amount:150,notes:'Conferido'}),/já/);
});
test('guest benefits resolve only high entropy receipt and matching store, never a phone lookup',async()=>{
 const queries:any[]=[];const data=isolated('src/lib/data/guest-benefits.ts',{'server-only':{},zod:await import('zod'),'@prisma/client':{Prisma},'@/lib/db':{prisma:{order:{findFirst:async(q:any)=>{queries.push(q);return null;}}}},'./transaction':{},'@/lib/growth':rules,'@/lib/operation-error':{OperationError}});
 assert.equal(await data.getGuestBenefits('shop','short'),null);assert.equal(queries.length,0);
 assert.equal(await data.getGuestBenefits('shop','clreceiptverylongrandomidentifier'),null);assert.equal(queries.length,1);assert.deepEqual(queries[0].where,{id:'clreceiptverylongrandomidentifier',organization:{slug:'shop'},customerId:{not:null}});assert.equal(JSON.stringify(queries[0]).includes('phone'),false);assert.equal(JSON.stringify(queries[0]).includes('address'),false);
});
test('money input preserves erase and decimal typing, formats only on blur',()=>{assert.equal(parseMoneyInput(''),null);assert.equal(formatMoneyInput(''),'');assert.equal(parseMoneyInput('25,00'),25);assert.equal(parseMoneyInput('1.234,56'),1234.56);assert.equal(parseMoneyInput('25.50'),25.5);assert.equal(formatMoneyInput('25'),'25,00');assert.equal(formatMoneyInput('0'),'0,00');assert.equal(parseMoneyInput('abc'),null);assert.equal(parseMoneyInput('1,2,3'),null);});
