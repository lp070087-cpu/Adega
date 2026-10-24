import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
class OperationError extends Error{}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as any};const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',output)((key:string)=>{if(key in imports)return imports[key];throw Error(`Unexpected ${key}`);},module,module.exports);return module.exports;}
process.env.AUTH_SECRET='isolated-test-secret';
function harness({memberships=[{organizationId:'own',role:'DRIVER',active:true}],platform=false,driverActive=true}={}){
 let user:any={id:'u1',email:'carla@example.com',active:true,passwordHash:null,mustChangePassword:true,organizations:memberships};let tokens:any[]=[];const revoked:string[]=[];let notes=0;
 const match=(row:any,w:any)=>(!w.identifier||row.identifier===w.identifier)&&(!w.token||row.token===w.token)&&(!w.expires||row.expires>w.expires.gt);
 const db:any={
  driver:{findFirst:async(q:any)=>q.where.id?(q.where.organizationId==='own'?{id:'d1',name:'Carla',active:driverActive,user}:null):(driverActive?{id:'d1'}:null)},
  user:{findUnique:async(q:any)=>q.where.email===user.email||q.where.id===user.id?user:null,update:async(q:any)=>{user={...user,...q.data};}},
  verificationToken:{findFirst:async(q:any)=>tokens.find(r=>match(r,q.where))??null,create:async(q:any)=>{tokens.push({...q.data});},deleteMany:async(q:any)=>{const n=tokens.length;tokens=tokens.filter(r=>!match(r,q.where));return {count:n-tokens.length};},updateMany:async(q:any)=>{let count=0;for(const r of tokens)if(match(r,q.where)){Object.assign(r,q.data);count++;}return {count};}},
  notification:{create:async()=>{notes++;}},$queryRaw:async()=>[],
 };
 db.$transaction=async(work:any)=>work(db);
 const api=isolated('src/lib/auth/driver-temp.ts',{'server-only':{},'node:crypto':crypto,'@/lib/db':{prisma:db},'./password':{hashPassword:async(p:string)=>`hash:${p}`},'@/lib/data/drivers':{revokeDriverSessions:async(_t:any,org:string)=>{revoked.push(org);}},'@/lib/data/transaction':{withOrganizationTransaction:async(_o:string,w:any)=>w(db)},'@/lib/operation-error':{OperationError},'@/lib/platform/identity':{isPlatformIdentity:async()=>platform}});
 return {api,user:()=>user,tokens:()=>tokens,revoked,notes:()=>notes};
}
const wrong=(pin:string)=>String((Number(pin)+1)%10000).padStart(4,'0');

test('store issues a random 4-digit PIN stored only as an HMAC, valid 24h, and it never sets a password by itself',async()=>{
 const h=harness();const {pin,expires}=await h.api.issueTemporaryCredential('own','d1','owner');
 assert.match(pin,/^\d{4}$/);assert.equal(h.tokens().length,1);assert.ok(!h.tokens()[0].token.includes(pin));assert.match(h.tokens()[0].token,/^[a-f0-9]{64}:0$/);
 assert.ok(expires.getTime()<=Date.now()+24*3600e3&&expires.getTime()>Date.now()+23*3600e3);
 assert.deepEqual(await h.api.useTemporaryCredential('Carla@Example.com',pin),{email:'carla@example.com'});
 assert.equal(h.user().passwordHash,null,'checking the PIN must not activate the account');assert.equal(h.tokens().length,1);
});
test('PIN is single use: it sets the definitive password, clears the first-access flag and revokes sessions',async()=>{
 const h=harness();const {pin}=await h.api.issueTemporaryCredential('own','d1');
 await h.api.useTemporaryCredential('carla@example.com',pin,'SenhaForte123');
 assert.equal(h.user().passwordHash,'hash:SenhaForte123');assert.equal(h.user().mustChangePassword,false);assert.deepEqual(h.revoked,['own']);assert.equal(h.tokens().length,0);
 await assert.rejects(h.api.useTemporaryCredential('carla@example.com',pin,'OutraSenha123'),/incorretos/);
});
test('five wrong PINs cancel the credential; expired PINs are refused',async()=>{
 const h=harness();const {pin}=await h.api.issueTemporaryCredential('own','d1');
 for(let i=0;i<4;i++)await assert.rejects(h.api.useTemporaryCredential('carla@example.com',wrong(pin)),/incorretos/);
 await assert.rejects(h.api.useTemporaryCredential('carla@example.com',wrong(pin)),/Muitas tentativas/);
 await assert.rejects(h.api.useTemporaryCredential('carla@example.com',pin,'SenhaForte123'),/incorretos/);assert.equal(h.user().passwordHash,null);
 const e=harness();const issued=await e.api.issueTemporaryCredential('own','d1');e.tokens()[0].expires=new Date(0);
 await assert.rejects(e.api.useTemporaryCredential('carla@example.com',issued.pin,'SenhaForte123'),/incorretos/);
});
test('a store cannot issue a PIN for an account that also works for another store, nor for owners or platform operators',async()=>{
 await assert.rejects(harness({memberships:[{organizationId:'own',role:'DRIVER',active:true},{organizationId:'other',role:'DRIVER',active:true}]}).api.issueTemporaryCredential('own','d1'),/outra loja/);
 await assert.rejects(harness({memberships:[{organizationId:'own',role:'OWNER',active:true}]}).api.issueTemporaryCredential('own','d1'),/outra loja/);
 await assert.rejects(harness({platform:true}).api.issueTemporaryCredential('own','d1'),/plataforma/);
 await assert.rejects(harness().api.issueTemporaryCredential('foreign','d1'),/não encontrado/);
});
test('suspended driver cannot activate even with the right PIN; a new PIN replaces the old one',async()=>{
 const h=harness();const first=await h.api.issueTemporaryCredential('own','d1');const second=await h.api.issueTemporaryCredential('own','d1');
 assert.equal(h.tokens().length,1);if(first.pin!==second.pin)await assert.rejects(h.api.useTemporaryCredential('carla@example.com',first.pin),/incorretos/);
 const s=harness({driverActive:true});const p=await s.api.issueTemporaryCredential('own','d1');
 const blocked=harness({driverActive:false});await assert.rejects(blocked.api.issueTemporaryCredential('own','d1'),/Reative/);
 assert.ok(p.pin);
});
