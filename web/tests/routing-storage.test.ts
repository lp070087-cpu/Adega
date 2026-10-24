import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
class OperationError extends Error{}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as any};const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',output)((key:string)=>{if(key in imports)return imports[key];throw Error(`Unexpected ${key}`);},module,module.exports);return module.exports;}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('openrouteservice route keeps the key on the server and converts GeoJSON to map order',async()=>{
 const original=globalThis.fetch;const calls:any[]=[];
 process.env.ROUTING_PROVIDER='ors';process.env.ORS_API_KEY='server-key';
 globalThis.fetch=(async(url:string,init:any)=>{calls.push({url,init});return json({features:[{geometry:{coordinates:[[-34.9,-8.05],[-34.89,-8.04]]},properties:{summary:{distance:1800,duration:300}}}]});}) as any;
 try{
  const {streetRoute,routingConfigured}=isolated('src/lib/maps/routing.ts',{'server-only':{}});
  assert.equal(routingConfigured(),true);
  const route=await streetRoute({latitude:-8.05,longitude:-34.9},{latitude:-8.04,longitude:-34.89});
  assert.deepEqual(route,{available:true,coordinates:[[-8.05,-34.9],[-8.04,-34.89]],distanceMeters:1800,durationSeconds:300,provider:'openrouteservice'});
  assert.equal(calls[0].init.headers.Authorization,'server-key');
  assert.deepEqual(JSON.parse(calls[0].init.body).coordinates,[[-34.9,-8.05],[-34.89,-8.04]]);
  globalThis.fetch=(async()=>json({error:'quota'},429)) as any;
  assert.deepEqual(await streetRoute({latitude:1,longitude:1},{latitude:2,longitude:2}),{available:false,reason:'unavailable'});
  delete process.env.ORS_API_KEY;
  assert.equal(routingConfigured(),false);
  assert.deepEqual(await streetRoute({latitude:1,longitude:1},{latitude:2,longitude:2}),{available:false,reason:'not_configured'});
 }finally{globalThis.fetch=original;delete process.env.ROUTING_PROVIDER;}
});

test('vercel blob storage is used only with a token and validates the image before sending',async()=>{
 const puts:any[]=[];
 const blob={put:async(path:string,_body:Buffer,options:any)=>{puts.push({path,options});return {url:`https://store.public.blob.vercel-storage.com/${path}`};}};
 const load=()=>isolated('src/lib/storage.ts',{'server-only':{},'@/lib/operation-error':{OperationError},'node:crypto':crypto,'@vercel/blob':blob});
 delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.STORAGE_PROVIDER;
 assert.deepEqual(load().storageStatus(),{provider:'manual-url',configured:false});
 process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_test_secret';
 const storage=load();
 assert.deepEqual(storage.storageStatus(),{provider:'vercel-blob',configured:true});
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16)]);
 const result=await storage.getStorage().upload(png,{filename:'banner.png',contentType:'image/png',folder:'organizations/o1/banners'});
 assert.match(result.url,/^https:\/\/store\.public\.blob\.vercel-storage\.com\/organizations\/o1\/banners\/[0-9a-f-]{36}\.png$/);
 assert.equal(puts[0].options.access,'public');
 await assert.rejects(storage.getStorage().upload(Buffer.from('not an image'),{filename:'x.png',contentType:'image/png'}),/JPEG, PNG ou WebP/);
 assert.equal(puts.length,1);
 delete process.env.BLOB_READ_WRITE_TOKEN;
});
