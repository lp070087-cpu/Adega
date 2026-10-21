import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { stockInlineSchema } from '../src/lib/stock-inline';
import { OperationError } from '../src/lib/operation-error';

function harness({ authorized = true, foreign = false, stock = 12, conflict = false } = {}) {
  const writes: any[] = [];
  const product: any = { id: 'p', name: 'Produto', stock, minimumStock: 5, cost: null, price: 20, promotionalPrice: null, trackStock: true };
  const tx = { product: { findFirst: async ({where}: any) => { assert.equal(where.organizationId, 'own'); return foreign ? null : product; }, updateMany: async ({where, data}: any) => { assert.equal(where.organizationId, 'own'); const field=Object.keys(data)[0]; assert.equal(where[field], product[field]); if(field==='price') assert.equal(where.promotionalPrice, product.promotionalPrice); if(conflict) return {count:0}; writes.push(['product', data]); Object.assign(product, data); return {count:1}; } }, inventoryMovement: { create: async ({data}: any) => writes.push(['movement', data]) }, notification: { create: async ({data}: any) => writes.push(['audit', data]) } };
  const imports: any = { 'next/cache': { revalidatePath() {} }, '@/lib/stock-inline': { stockInlineSchema }, '@/lib/operation-error': { OperationError }, '@/lib/auth/guards': { requirePermission: async (permission: string) => { if (!authorized) throw Error('Forbidden'); writes.push(['permission', permission]); return { organizationId: 'own', user: {id:'actor'} }; }, toActionError: (e: Error) => ({error:e.message}) }, '@/lib/data/transaction': { withOrganizationTransaction: async (id: string, fn: any) => { assert.equal(id,'own'); return fn(tx); } } };
  const output=ts.transpileModule(readFileSync('src/app/actions/stock-inline.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as any}; new Function('require','module','exports',output)((name:string)=>{if(!(name in imports))throw Error(name);return imports[name];},mod,mod.exports);
  return {action:mod.exports.updateStockInlineAction,writes,product};
}
const input={ productId:'p',field:'stock' as const,value:25,previousValue:12,reason:'Contagem física conferida' };
test('inline stock correction audits exact difference, actor and tenant; replay cannot overwrite',async()=>{
  const h=harness();assert.equal((await h.action(input)).ok,true);const movement=h.writes.find(([kind])=>kind==='movement')[1];assert.equal(movement.quantity,13);assert.equal(movement.previousStock,12);assert.equal(movement.newStock,25);assert.equal(movement.userId,'actor');assert.equal(movement.organizationId,'own');assert.equal((await h.action(input)).ok,false);
});
test('inline editing rejects foreign resources, missing permission, stale quantity and invalid values',async()=>{
  for(const config of [{authorized:false},{foreign:true},{stock:13}]){const h=harness(config);assert.equal((await h.action(input)).ok,false);assert.equal(h.writes.filter(([kind])=>kind!=='permission').length,0);}
  for(const value of [-1,1.5,NaN,Infinity]) assert.equal(stockInlineSchema.safeParse({...input,value}).success,false);
  assert.equal(stockInlineSchema.safeParse({...input,field:'cost',value:12.345}).success,false);
});
test('minimum, cost and price changes preserve quantity and require appropriate permission',async()=>{
  for(const [field,previousValue,value,permission] of [['minimumStock',5,6,'MANAGE_STOCK'],['cost',null,12.5,'MANAGE_PRODUCTS'],['price',20,22.9,'MANAGE_PRODUCTS']] as const){const h=harness();assert.equal((await h.action({...input,field,previousValue,value})).ok,true);assert.equal(h.product.stock,12);assert.ok(h.writes.some(([kind,p])=>kind==='permission'&&p===permission));assert.ok(h.writes.some(([kind])=>kind==='audit'));assert.ok(!h.writes.some(([kind])=>kind==='movement'));}
});
test('price editing cannot invalidate an existing promotion or erase it silently',async()=>{
  const h=harness();h.product.promotionalPrice=18;assert.equal((await h.action({...input,field:'price',previousValue:20,value:17})).ok,false);assert.equal(h.product.price,20);assert.equal(h.product.promotionalPrice,18);
});

function inventoryHarness() {
  const writes:any[]=[];let query:any;
  const tx:any={product:{findFirst:async()=>({id:'p',name:'Produto',stock:13,trackStock:true}),update:async(args:any)=>writes.push(args)},inventoryMovement:{create:async(args:any)=>writes.push(args)}};
  const imports:any={'server-only':{},'@/lib/operation-error':{OperationError},'@/lib/db':{prisma:{product:{findMany:async(args:any)=>{query=args;return [];}}},toNumber:Number},'@/lib/data/transaction':{withOrganizationTransaction:async(id:string,fn:any)=>{assert.equal(id,'own');return fn(tx);}}};
  const compiled=ts.transpileModule(readFileSync('src/lib/data/inventory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as any};new Function('require','module','exports',compiled)((name:string)=>{if(!(name in imports))throw Error(name);return imports[name];},mod,mod.exports);
  return {inventory:mod.exports,writes,query:()=>query};
}
test('physical count rejects stale stock inside the transaction and accepts a fresh count',async()=>{
  const h=inventoryHarness();await assert.rejects(h.inventory.setStock('own','p',25,'Contagem física','actor',12),/quantidade mudou/);assert.equal(h.writes.length,0);
  const result=await h.inventory.setStock('own','p',25,'Contagem física','actor',13);assert.equal(result.diff,12);assert.equal(h.writes[1].data.previousStock,13);assert.equal(h.writes[1].data.userId,'actor');
});
test('Total includes uncontrolled products only when requested, while existing operational queries remain controlled',async()=>{
  const h=inventoryHarness();await h.inventory.getStockProducts('own');assert.equal(h.query().where.trackStock,true);await h.inventory.getStockProducts('own',undefined,true);assert.deepEqual(h.query().where,{organizationId:'own'});assert.equal(h.query().select.available,true);
});

test('a competing catalog edit makes the atomic write fail before movement or audit',async()=>{
 for(const field of ['stock','minimumStock','cost','price'] as const){const h=harness({conflict:true});assert.equal((await h.action({...input,field,previousValue:h.product[field],value:25})).ok,false);assert.equal(h.writes.filter(([kind])=>kind!=='permission').length,0);}
});
