import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import * as turbo from '../src/lib/turbo';
import * as growth from '../src/lib/growth';
const now=new Date('2026-10-21T15:00:00Z');
const campaign:turbo.TurboCampaign={id:'6f9d6358-3bb0-4917-a19d-2108c842a5f2',name:'Entrega Turbo bairro',status:'ACTIVE',startsAt:'2026-10-01T03:00:00.000Z',endsAt:'2026-11-01T02:59:59.000Z',weekdays:[0,1,2,3,4,5,6],startTime:'08:00',endTime:'22:00',audience:'ALL',customerIds:[],minOrders:0,inactiveDays:0,conditions:'Entrega para os bairros confirmados pela loja, conforme capacidade.',message:'Entrega Turbo disponível. Confira as condições antes de pedir.',frequencyHours:24,audienceLimit:100,createdAt:'2026-10-01T03:00:00Z',updatedAt:'2026-10-01T03:00:00Z',createdBy:'owner'};
const customer:turbo.TurboCustomer={id:'own',name:'Cliente da loja',createdAt:new Date('2026-01-01'),lastOrderAt:new Date('2026-10-20T12:00:00Z'),deliveredOrders:3};
function consented(){const state=growth.growthState({});state.consents.own={optOut:false,turboConsent:true,updatedAt:now.toISOString(),actorId:'receipt:proof'};return state;}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as any};const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',output)((name:string)=>{if(!(name in imports))throw Error(`Unexpected dependency ${name}`);return imports[name];},module,module.exports);return module.exports;}
class OperationError extends Error{}
test('Turbo is independent of discounts, shipping and loyalty; legacy data remains intact',()=>{
  const legacy={id:'legacy',type:'TURBO',minimumOrder:0,discountPercent:100,fixedDiscount:100} as growth.Campaign;
  assert.deepEqual(growth.campaignBenefit(legacy,100,9),{discount:0,deliveryDiscount:0});
  const state=growth.growthState({growth:{campaigns:[legacy],ledger:[{key:'old',points:20}]}});
  assert.equal(state.campaigns[0].id,'legacy');assert.equal(state.ledger[0].points,20);assert.deepEqual(state.turboCampaigns,[]);assert.deepEqual(state.turboNotices,[]);
});
test('Turbo requires explicit internal consent; old non-opt-out is not an opt-in',()=>{
  const state=consented();assert.equal(turbo.turboEligibility(campaign,customer,state,now),null);
  state.consents.own.turboConsent=false;assert.match(turbo.turboEligibility(campaign,customer,state,now)!,/consentimento/);
  delete state.consents.own.turboConsent;assert.match(turbo.turboEligibility(campaign,customer,state,now)!,/consentimento/);
  state.consents.own.turboConsent=true;state.consents.own.optOut=true;assert.match(turbo.turboEligibility(campaign,customer,state,now)!,/consentimento/);
});
test('recent-30 and custom audiences use actual delivered orders and scoped selections',()=>{
  const state=consented();assert.equal(turbo.turboEligibility({...campaign,audience:'RECENT_30'},customer,state,now),null);
  assert.match(turbo.turboEligibility({...campaign,audience:'RECENT_30'},{...customer,lastOrderAt:new Date('2026-09-01')},state,now)!,/30 dias/);
  assert.match(turbo.turboEligibility({...campaign,audience:'RECENT_30'},{...customer,lastOrderAt:null},state,now)!,/30 dias/);
  const custom={...campaign,audience:'CUSTOM' as const,customerIds:['other'],minOrders:1};
  assert.match(turbo.turboEligibility(custom,customer,state,now)!,/selecionados/);
  assert.equal(turbo.turboEligibility({...custom,customerIds:['own']},customer,state,now),null);
  assert.match(turbo.turboEligibility({...custom,customerIds:['own'],minOrders:4},customer,state,now)!,/pedidos/);
});
test('overnight campaign window belongs to the prior weekday and expires exactly at end',()=>{
  const overnight={weekdays:[6],startTime:'22:00',endTime:'02:00'};
  assert.equal(turbo.turboHoursMatch(overnight,new Date('2026-10-25T04:00:00Z')),true);
  assert.equal(turbo.turboHoursMatch(overnight,new Date('2026-10-25T05:00:00Z')),false);
  assert.equal(turbo.turboHoursMatch(overnight,new Date('2026-10-26T04:00:00Z')),false);
  assert.equal(turbo.turboCampaignSchema.safeParse({...campaign,startTime:'25:00'}).success,false);
  assert.equal(turbo.turboCampaignSchema.safeParse({...campaign,weekdays:[]}).success,false);
  assert.equal(turbo.turboCampaignSchema.safeParse({...campaign,audience:'CUSTOM'}).success,false);
});
test('preview honors dates, hours, limits, global frequency and per-campaign deduplication',()=>{
  const state=consented();assert.equal(turbo.previewTurboAudience({...campaign,status:'DRAFT'},[customer],state,now).length,1);
  assert.match(turbo.turboEligibility({...campaign,status:'DRAFT'},customer,state,now)!,/inativa/);
  assert.equal(turbo.previewTurboAudience({...campaign,endsAt:'2026-10-20T23:00:00Z'},[customer],state,now).length,0);
  state.contacts.push({id:'prior',campaignId:'other',customerId:'own',createdAt:now.toISOString(),actorId:'actor'});
  assert.equal(turbo.previewTurboAudience(campaign,[customer],state,now).length,0);state.contacts=[];
  state.turboNotices.push({id:'notice',key:campaign.id+':own',campaignId:campaign.id,customerId:'own',title:'old',message:'old',conditions:'old',createdAt:'2026-10-01T12:00:00Z',endsAt:campaign.endsAt,actorId:'actor'});
  assert.match(turbo.turboEligibility(campaign,customer,state,now)!,/já publicado/);
});
function dataHarness(){
  let settings:any={untouched:true,growth:{...consented(),turboCampaigns:[campaign]}};
  let writes=0;const audits:any[]=[];
  const db:any={organization:{findUniqueOrThrow:async(q:any)=>{assert.equal(q.where.id,'org');return {settings:structuredClone(settings)};},update:async(q:any)=>{assert.equal(q.where.id,'org');writes++;settings=q.data.settings;}},customer:{findMany:async(q:any)=>{assert.equal(q.where.organizationId,'org');return [{id:customer.id,name:customer.name,createdAt:customer.createdAt,orders:[{createdAt:customer.lastOrderAt}],_count:{orders:3}}];},count:async(q:any)=>{assert.equal(q.where.organizationId,'org');return q.where.id.in.filter((id:string)=>id==='own').length;}},notification:{create:async(q:any)=>{assert.equal(q.data.organizationId,'org');audits.push(q.data);}}};
  const data=isolated('src/lib/data/turbo.ts',{'server-only':{},'node:crypto':crypto,'@/lib/db':{prisma:db},'@/lib/growth':growth,'@/lib/turbo':{...turbo,previewTurboAudience:(c:any,rows:any,state:any)=>turbo.previewTurboAudience(c,rows,state,now)},'@/lib/operation-error':{OperationError},'./transaction':{withOrganizationTransaction:async(id:string,work:any)=>{assert.equal(id,'org');return work(db);}}});
  return {data,settings:()=>settings,setSettings:(next:any)=>{settings=next;},writes:()=>writes,audits};
}
test('preview is read only; publishing is scoped, persistent, audited and cannot be repeated',async()=>{
  const h=dataHarness();const preview=await h.data.previewTurbo('org',campaign.id);assert.equal(h.writes(),0);assert.equal(preview.customers.length,1);
  assert.equal(await h.data.publishTurboNotices('org','actor',campaign.id,preview.digest,'Prévia conferida'),1);
  assert.equal(h.settings().untouched,true);assert.equal(h.settings().growth.turboNotices.length,1);assert.equal(h.audits.length,1);
  await assert.rejects(h.data.publishTurboNotices('org','actor',campaign.id,preview.digest,'Prévia conferida'),/mudou/);
  assert.equal(h.settings().growth.turboNotices.length,1);
});
test('stale preview, foreign campaign, foreign client and paused campaign cannot publish',async()=>{
  const h=dataHarness();const preview=await h.data.previewTurbo('org',campaign.id);
  const state=h.settings();state.growth.consents.own.optOut=true;h.setSettings(state);
  await assert.rejects(h.data.publishTurboNotices('org','actor',campaign.id,preview.digest,'Conferido'),/mudou/);
  await assert.rejects(h.data.previewTurbo('org','foreign'),/nesta loja/);
  await assert.rejects(h.data.saveTurboCampaign('org','actor',{...campaign,audience:'CUSTOM',customerIds:['foreign']},'Conferido'),/pertencer/);
  state.growth.turboCampaigns[0]={...campaign,status:'PAUSED'};h.setSettings(state);
  await assert.rejects(h.data.publishTurboNotices('org','actor',campaign.id,preview.digest,'Conferido'),/Ative/);
  assert.equal(h.writes(),0);
});
test('saving independent Turbo preserves discounts, points, unrelated settings and existing notices',async()=>{
  const h=dataHarness();const state=h.settings();state.growth.ledger=[{key:'old-ledger',points:10}];state.growth.campaigns=[{id:'discount',type:'DISCOUNT'}];h.setSettings(state);
  await h.data.saveTurboCampaign('org','actor',{...campaign,audience:'CUSTOM',customerIds:['own','own'],status:'DRAFT'},'Condições conferidas');
  assert.equal(h.settings().growth.turboCampaigns.length,1);assert.deepEqual(h.settings().growth.turboCampaigns[0].customerIds,['own']);
  assert.equal(h.settings().growth.campaigns[0].id,'discount');assert.equal(h.settings().growth.ledger[0].points,10);assert.equal(h.settings().untouched,true);assert.equal(h.audits.length,1);
});
test('Turbo actions reject unauthorized callers before tenant reads or writes',async()=>{
  let called=0;
  const actions=isolated('src/app/actions/turbo.ts',{zod:{z},'next/cache':{revalidatePath:()=>{}},'@/lib/auth/guards':{requirePermission:async()=>{throw new OperationError('Sem permissão');},toActionError:(e:Error)=>({error:e.message})},'@/lib/db':{prisma:{}},'@/lib/operation-error':{OperationError},'@/lib/data/drivers':{getDriverMap:async()=>{called++;}},'@/lib/schedule':{},'@/lib/data/turbo':{previewTurbo:async()=>{called++;},publishTurboNotices:async()=>{called++;},saveTurboCampaign:async()=>{called++;}},'@/lib/turbo':turbo});
  assert.equal((await actions.saveTurboAction({},new FormData())).ok,false);
  assert.equal((await actions.previewTurboAction(campaign.id)).ok,false);
  assert.equal((await actions.publishTurboAction({},new FormData())).ok,false);
  assert.equal(called,0);
});
