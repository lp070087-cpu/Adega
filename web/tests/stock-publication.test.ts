import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { OperationError } from '../src/lib/operation-error';
import * as policy from '../src/lib/stock-publication';
import { groupPublishedStoreProducts } from '../src/lib/store-catalog-groups';
import { storeProductAvailability } from '../src/lib/store-product-availability';
import { previewStockPublication } from '../scripts/preview-stock-publication';

function harness({ authorized=true, role='OWNER', foreign=false, combo=false, pending=false }={}) {
  const writes:any[]=[];
  const product:any={id:'p',name:'Produto',stock:9,minimumStock:2,active:false,available:false,trackStock:true,updatedAt:new Date('2026-01-01'),combo:combo?{id:'combo'}:null};
  const organization:any={name:'Loja própria',settings:{preserved:true}};
  const tx:any={
    organization:{findUniqueOrThrow:async()=>organization,update:async({data}:any)=>{writes.push(['organization',data]);organization.settings=data.settings;}},
    product:{findMany:async({where}:any)=>{assert.equal(where.organizationId,'own');return foreign?[]:[{...product}];},update:async({where,data}:any)=>{assert.equal(where.organizationId,'own');writes.push(['product',data]);Object.assign(product,data,{updatedAt:new Date('2026-02-01')});}},
    orderItem:{findMany:async({where}:any)=>{assert.equal(where.order.organizationId,'own');return pending?[{productId:'p'}]:[];}},
    combo:{findMany:async()=>[]},inventoryMovement:{create:async({data}:any)=>writes.push(['movement',data])},notification:{create:async({data}:any)=>writes.push(['notification',data])},
  };
  const imports:Record<string,unknown>={zod:{z},'next/cache':{revalidatePath(){}},'@/lib/operation-error':{OperationError},'@/lib/auth/guards':{requirePermission:async()=>{if(!authorized)throw new Error('Forbidden');return {organizationId:'own',role,user:{id:'actor',name:'Operador'}};},toActionError:(e:Error)=>({error:e.message})},'@/lib/permissions':{can:(_:string,permission:string)=>role==='OWNER'||permission==='MANAGE_PRODUCTS'},'@/lib/data/transaction':{withOrganizationTransaction:async(id:string,fn:any)=>{assert.equal(id,'own');return fn(tx);}},'@/lib/stock-publication':policy};
  const source=ts.transpileModule(readFileSync('src/app/actions/stock-publication.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as any};new Function('require','module','exports',source)((name:string)=>{if(!(name in imports))throw Error(name);return imports[name];},mod,mod.exports);
  return {action:mod.exports.stockPublicationAction,writes,product,organization};
}
const input={mode:'INITIALIZE',requestId:'36068ac7-408a-44b9-9277-7d1a883e108b',changes:[{id:'p',stock:25,minimumStock:5,active:true,available:true,trackStock:true}],reason:'Contagem física conferida pelo proprietário',confirm:false};
test('batch preview identifies tenant, old/new balance/minimum and activation without writes',async()=>{
  const h=harness();const result=await h.action(input);assert.equal(result.ok,true);assert.equal(result.data.organization.id,'own');assert.equal(result.data.rows[0].previous.stock,9);assert.equal(result.data.rows[0].proposed.stock,25);assert.equal(result.data.rows[0].previous.minimumStock,2);assert.equal(result.data.rows[0].proposed.minimumStock,5);assert.equal(result.data.rows[0].previous.active,false);assert.equal(h.writes.length,0);
});
test('confirmed stock publication adjusts existing product once and preserves unrelated settings',async()=>{
  const h=harness();const preview=await h.action(input);const confirm={...input,confirm:true,previewDigest:preview.data.digest};
  const result=await h.action(confirm);assert.equal(result.ok,true);assert.equal(h.product.stock,25);assert.equal(h.product.minimumStock,5);assert.equal(h.product.active,true);assert.equal(h.organization.settings.preserved,true);
  const movement=h.writes.find(([kind])=>kind==='movement')[1];assert.equal(movement.previousStock,9);assert.equal(movement.newStock,25);assert.equal(movement.quantity,16);assert.equal(movement.userId,'actor');
  const count=h.writes.length;const repeated=await h.action(confirm);assert.equal(repeated.data.repeated,true);assert.equal(h.writes.length,count);
  assert.equal((await h.action({...confirm,reason:'Outro motivo incompatível para a mesma referência'})).ok,false);
});
test('changed stock invalidates preview; exclusions and foreign resources cannot be forced into batch',async()=>{
  const h=harness();const preview=await h.action(input);h.product.stock=8;assert.equal((await h.action({...input,confirm:true,previewDigest:preview.data.digest})).ok,false);assert.equal(h.writes.length,0);
  for(const config of [{combo:true},{pending:true}]) {const excluded=harness(config);const p=await excluded.action(input);assert.ok(p.data.rows[0].excluded);assert.equal((await excluded.action({...input,confirm:true,previewDigest:p.data.digest})).ok,false);assert.equal(excluded.writes.length,0);}
  const foreign=harness({foreign:true});assert.equal((await foreign.action(input)).ok,false);assert.equal(foreign.writes.length,0);
});
test('batch requires permission, explicit preview and integer quantities; fixed initialization cannot be tampered',async()=>{
  for(const config of [{authorized:false},{role:'MANAGER'}]){const h=harness(config);assert.equal((await h.action(input)).ok,false);assert.equal(h.writes.length,0);}
  const h=harness();for(const changes of [[{...input.changes[0],stock:24}],[{...input.changes[0],stock:1.5}],[{...input.changes[0],stock:-1}]]) assert.equal((await h.action({...input,changes})).ok,false);
  assert.equal((await h.action({...input,confirm:true})).ok,false);assert.equal(h.writes.length,0);
});
test('store category grouping retains all published products including zero stock and paused categories',()=>{
  const products=Array.from({length:650},(_,index)=>({id:String(index),categoryId:index%3===0?'active':index%3===1?'paused':null,stock:0,available:false}));
  const groups=groupPublishedStoreProducts(products,[{id:'active',name:'Categoria ativa',slug:'ativa',emoji:null}]);
  const rendered=groups.flatMap(group=>group.items);assert.equal(rendered.length,650);assert.equal(new Set(rendered.map(p=>p.id)).size,650);assert.equal(groups[1].category.name,'Outros produtos');
});
test('combo availability derives from exact component quantities and rejects paused or foreign components',()=>{
  const component={organizationId:'own',active:true,available:true,stock:5,trackStock:true,combo:null};
  const combo={available:true,stock:0,trackStock:false,combo:{items:[{quantity:2,product:component}]}};
  assert.deepEqual(storeProductAvailability(combo,'own'),{available:true,trackStock:true,stock:2});
  assert.equal(storeProductAvailability({...combo,combo:{items:[{quantity:6,product:component}]}},'own').stock,0);
  for(const changed of [{available:false},{active:false},{organizationId:'foreign'},{combo:{id:'nested'}}]) assert.equal(storeProductAvailability({...combo,combo:{items:[{quantity:1,product:{...component,...changed}}]}},'own').available,false);
  assert.deepEqual(storeProductAvailability({available:true,stock:0,trackStock:true,combo:null},'own'),{available:true,trackStock:true,stock:0});
});
test('owner stock preview is read-only, aggregates old/proposed units and requires an explicit choice for multiple stores',async()=>{
  let organizations=[{id:'own',name:'Loja',slug:'loja'}];let active=true;let queries=0;
  const db:any={user:{findMany:async()=>[{id:'owner',email:'lp070087@gmail.com',active}]},organizationUser:{findMany:async({where}:any)=>{assert.equal(where.role,'OWNER');assert.equal(where.active,true);return organizations.map(organization=>({organization}));}},product:{findMany:async({where}:any)=>{queries++;assert.equal(where.organizationId,'own');return [{id:'p',stock:9,minimumStock:2,active:false,available:false,trackStock:true,combo:null}];}},orderItem:{findMany:async()=>[]},combo:{findMany:async()=>[]}};
  const report=await previewStockPublication(db);assert.equal(report.writeExecuted,false);assert.equal(report.eligible,1);assert.equal(report.previous.units,9);assert.equal(report.proposed.totalUnits,25);assert.equal(report.proposed.toActivate,1);
  organizations.push({id:'other',name:'Outra loja',slug:'outra'});await assert.rejects(previewStockPublication(db),/mais de uma/);await assert.rejects(previewStockPublication(db,'foreign'),/não pertence/);assert.equal(queries,1);
  assert.equal((await previewStockPublication(db,'own')).organization.id,'own');active=false;await assert.rejects(previewStockPublication(db,'own'),/ativa/);
});
