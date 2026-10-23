import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import {authConfig} from '../src/lib/auth/config';
class OperationError extends Error{}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as any};const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',output)((key:string)=>{if(key in imports)return imports[key];if(key==='@/lib/platform/identity')return {isPlatformIdentity:async()=>false};if(key==='@/lib/operation-error')return {OperationError};throw Error(`Unexpected ${key}`);},module,module.exports);return module.exports;}
function harness(platformIdentity=false){
 let user:any={id:'user',email:'driver@example.com',active:true,mustChangePassword:true,passwordHash:null,organizations:[{organizationId:'own-org',role:'DRIVER',active:true},{organizationId:'second-org',role:'DRIVER',active:true}]};let active=true,writes=0;const revoked:string[]=[];let tokens:any[]=[];const locks:any[]=[];
 const matches=(row:any,w:any)=>(!w.token||row.token===w.token)&&(!w.identifier||row.identifier===w.identifier)&&(!w.expires||row.expires>w.expires.gt);
 const tx:any={$queryRaw:async(_s:any,stores:string[])=>{locks.push(stores);return [];},user:{findUnique:async(q:any)=>(q.where.id===user.id||q.where.email===user.email)?user:null,update:async(q:any)=>{assert.equal(q.where.id,user.id);writes++;user={...user,...q.data};return user;}},driver:{findFirst:async(q:any)=>{assert.ok(q.where.organizationId.in.includes('own-org'));return active?{id:'driver',organizationId:'own-org'}:null;}},verificationToken:{findFirst:async(q:any)=>tokens.find(row=>matches(row,q.where))??null,create:async(q:any)=>{tokens.push({...q.data});return q.data;},deleteMany:async(q:any)=>{const old=tokens.length;tokens=tokens.filter(row=>!matches(row,q.where));return {count:old-tokens.length};},updateMany:async(q:any)=>{let count=0;for(const row of tokens)if(matches(row,q.where)){Object.assign(row,q.data);count++;}return {count};}},notification:{create:async(q:any)=>{assert.equal(q.data.organizationId,'own-org');return q.data;}}};
 tx.$transaction=async(work:any)=>Array.isArray(work)?Promise.all(work):work(tx);
 const data=isolated('src/lib/auth/driver-access.ts',{'server-only':{},'@/lib/platform/identity':{isPlatformIdentity:async()=>platformIdentity},'node:crypto':crypto,'@/lib/db':{prisma:tx},'./password':{hashPassword:async(value:string)=>`hashed:${value}`},'@/lib/data/drivers':{revokeDriverSessions:async(_tx:any,org:string,id:string)=>{assert.equal(id,user.id);revoked.push(org);}},'@/lib/operation-error':{OperationError}});
 return {data,user:()=>user,patch:(value:any)=>{user={...user,...value};},promote:()=>{platformIdentity=true;},inactive:()=>{active=false;},tokens:()=>tokens,writes:()=>writes,revoked:()=>revoked,locks};
}
function mailEnvironment(t:any){const previous={RESEND_API_KEY:process.env.RESEND_API_KEY,MAIL_FROM:process.env.MAIL_FROM,APP_PUBLIC_URL:process.env.APP_PUBLIC_URL,AUTH_SECRET:process.env.AUTH_SECRET};Object.assign(process.env,{RESEND_API_KEY:'isolated-test-key',MAIL_FROM:'Test <test@example.com>',APP_PUBLIC_URL:'https://shop.example.com',AUTH_SECRET:'isolated-test-secret'});const oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});const sent:any[]=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(String(options?.body)));return new Response(JSON.stringify({id:'message'}),{status:200});};return sent;}
const codeFrom=(mail:any)=>mail.text.match(/\b(\d{6})\b/)[1];
const wrong=(code:string)=>String((Number(code)+1)%1000000).padStart(6,'0');

test('first access sends a 6-digit code only to the registered e-mail and stores only an HMAC with expiration',async t=>{const sent=mailEnvironment(t);const h=harness();await h.data.requestDriverCode('DRIVER@example.com');assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['driver@example.com']);const code=codeFrom(sent[0]);assert.ok(!h.tokens()[0].token.includes(code));assert.match(h.tokens()[0].token,/^[a-f0-9]{64}:0$/);assert.ok(h.tokens()[0].expires>Date.now()+9*60*1000);assert.ok(h.tokens()[0].expires<=Date.now()+10*60*1000);assert.equal(h.writes(),0);await h.data.requestDriverCode('driver@example.com');assert.equal(sent.length,1,'resend is throttled for 60 seconds');});
test('the code sets the password once, verifies the e-mail and revokes sessions in every store',async t=>{const sent=mailEnvironment(t);const h=harness();await h.data.requestDriverCode('driver@example.com');const code=codeFrom(sent[0]);await assert.rejects(h.data.confirmDriverCode('driver@example.com','12345','SafePass123'),/inválido/);await assert.rejects(h.data.confirmDriverCode('other@example.com',code,'SafePass123'),/inválido/);assert.equal(h.writes(),0);assert.equal(await h.data.confirmDriverCode('Driver@Example.com',code,'SafePass123'),'driver@example.com');assert.equal(h.user().passwordHash,'hashed:SafePass123');assert.equal(h.user().mustChangePassword,false);assert.ok(h.user().emailVerified);assert.deepEqual(h.revoked(),['own-org','second-org']);assert.deepEqual(h.locks[0],['own-org','second-org']);await assert.rejects(h.data.confirmDriverCode('driver@example.com',code,'OtherPass123'),/inválido/);assert.equal(h.writes(),1);});
test('five wrong codes discard the code, so guessing is bounded',async t=>{const sent=mailEnvironment(t);const h=harness();await h.data.requestDriverCode('driver@example.com');const code=codeFrom(sent[0]);for(let i=0;i<4;i++)await assert.rejects(h.data.confirmDriverCode('driver@example.com',wrong(code),'SafePass123'),/inválido/);await assert.rejects(h.data.confirmDriverCode('driver@example.com',wrong(code),'SafePass123'),/Muitas tentativas/);assert.equal(h.tokens().length,0);await assert.rejects(h.data.confirmDriverCode('driver@example.com',code,'SafePass123'),/inválido/);assert.equal(h.writes(),0);});
test('expired codes, suspended drivers and owner accounts never get a code or a password',async t=>{const sent=mailEnvironment(t);const h=harness();await h.data.requestDriverCode('driver@example.com');const code=codeFrom(sent[0]);h.tokens()[0].expires=new Date(0);await assert.rejects(h.data.confirmDriverCode('driver@example.com',code,'SafePass123'),/inválido/);const suspended=harness();suspended.inactive();await suspended.data.requestDriverCode('driver@example.com');assert.equal(sent.length,1);const owner=harness();owner.patch({organizations:[{organizationId:'own-org',role:'OWNER',active:true}]});await owner.data.requestDriverCode('driver@example.com');assert.equal(sent.length,1);assert.equal(owner.writes()+suspended.writes()+h.writes(),0);});
test('existing password changes only after the code and a provider failure never leaves a usable code',async t=>{const sent=mailEnvironment(t);const h=harness();h.patch({mustChangePassword:false,passwordHash:'old-existing-hash'});await h.data.requestDriverCode('driver@example.com');assert.equal(h.user().passwordHash,'old-existing-hash');await h.data.confirmDriverCode('driver@example.com',codeFrom(sent[0]),'NewPass123');assert.equal(h.writes(),1);const failed=harness();globalThis.fetch=async()=>new Response('{}',{status:503});await assert.rejects(failed.data.requestDriverCode('driver@example.com'),/enviar/);assert.equal(failed.tokens().length,0);assert.equal(failed.writes(),0);});
test('missing e-mail configuration keeps first access closed with no database request or external send',async t=>{mailEnvironment(t);delete process.env.RESEND_API_KEY;const h=harness();assert.equal(h.data.driverMailReady(),false);await assert.rejects(h.data.requestDriverCode('driver@example.com'),/configuração/);assert.equal(h.tokens().length,0);assert.equal(h.writes(),0);});
test('central operator identities cannot request or use driver codes, including promotion after the code was sent',async t=>{const sent=mailEnvironment(t);const central=harness(true);await central.data.requestDriverCode('driver@example.com');assert.equal(sent.length,0);const later=harness();await later.data.requestDriverCode('driver@example.com');const code=codeFrom(sent[0]);later.promote();await assert.rejects(later.data.confirmDriverCode('driver@example.com',code,'NewPass123'),/inválido/);assert.equal(later.writes(),0);});
test('two concurrent confirmations consume the code only once',async t=>{const sent=mailEnvironment(t);const h=harness();await h.data.requestDriverCode('driver@example.com');const code=codeFrom(sent[0]);const result=await Promise.allSettled([h.data.confirmDriverCode('driver@example.com',code,'FirstPass123'),h.data.confirmDriverCode('driver@example.com',code,'SecondPass123')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.writes(),1);});

test('new individual driver account has no administrator-selected password and belongs only to its organization',async()=>{
 const created:any[]=[];const memberships:any[]=[];
 const tx:any={user:{create:async(q:any)=>{created.push(q.data);return {id:'new-user'};}},organizationUser:{create:async(q:any)=>{memberships.push(q.data);}},driver:{create:async(q:any)=>q.data}};
 const data=isolated('src/lib/data/drivers.ts',{'server-only':{},'@/lib/db':{prisma:{user:{findUnique:async()=>null}}},'@/lib/auth/password':{hashPassword:async()=>{throw Error('Administrator password must not be hashed');}},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'own-org');return work(tx);}},'@/lib/platform/quotas':{assertPlatformQuota:async()=>{}},'@/lib/data/driver-schedules':{},'@/lib/driver-schedule':{},'@/lib/data/driver-link':{driverMultiStoreReady:async()=>true}});
 const result=await data.createDriver('own-org',{name:'Driver Example',phone:'11999999999',vehicleType:'MOTORCYCLE',active:true,createLogin:true,email:'DRIVER@example.com',password:'IgnoredAdminPassword123',activationOnly:true});
 assert.equal(created[0].email,'driver@example.com');assert.equal(created[0].passwordHash,null);assert.equal(created[0].mustChangePassword,true);assert.equal(memberships[0].organizationId,'own-org');assert.equal(memberships[0].role,'DRIVER');assert.equal(result.organizationId,'own-org');assert.equal(result.userId,'new-user');
});

test('driver session deadline is signed and cannot be extended by client session updates; owner session is preserved',()=>{
 const token=authConfig.callbacks.jwt({token:{},user:{id:'driver',role:'DRIVER',driverSessionStartedAt:100,driverSessionUntil:200}} as any);
 assert.equal(token.driverSessionUntil,200);
 const unchanged=authConfig.callbacks.jwt({token,trigger:'update',session:{driverSessionUntil:Date.now()+9999999}} as any);assert.equal(unchanged.driverSessionUntil,200);
 const session=authConfig.callbacks.session({session:{user:{id:'driver'},expires:''},token:{userId:'driver',role:'DRIVER',driverSessionUntil:200}} as any);assert.equal(session.user.id,'');
 const owner=authConfig.callbacks.session({session:{user:{id:'owner'},expires:''},token:{userId:'owner',role:'OWNER',driverSessionUntil:200}} as any);assert.equal(owner.user.id,'owner');
});

function authorization(user:any,driverActive=true,platformIdentity=false){let config:any;let updates=0;const queries:any[]=[];isolated('src/lib/auth/index.ts',{'@/lib/platform/identity':{isPlatformIdentity:async()=>platformIdentity},'next-auth':{default:(options:any)=>{config=options;return {}; }},'next-auth/providers/credentials':{default:(options:any)=>options},'@/lib/db':{prisma:{user:{findUnique:async()=>user,update:async()=>{updates++;}},driver:{findMany:async(q:any)=>{queries.push(q);return driverActive?[{organizationId:'own-org'}]:[];}}}},'./password':{verifyPassword:async(password:string)=>password==='correct',fakeVerify:async()=>false},'./config':{authConfig:{}}});return {login:(raw:any)=>config.providers[0].authorize(raw),queries,updates:()=>updates};}
test('driver login rejects owner, inactive, pending activation and wrong passwords without changing owner login',async()=>{
 const base={id:'user',name:'Driver',email:'driver@example.com',passwordHash:'hash',active:true,mustChangePassword:false,organizations:[{organizationId:'own-org',role:'DRIVER',organization:{name:'Shop',slug:'shop'}}]};
 const active=authorization(base);const normal=await active.login({login:base.email,password:'correct',driverOnly:'true'});assert.ok(normal);assert.ok(Math.abs(normal.driverSessionUntil-normal.driverSessionStartedAt-8*3600000)<1000);assert.deepEqual(active.queries[0].where,{userId:'user',active:true});
 const persistent=await active.login({login:base.email,password:'correct',driverOnly:'true',remember:'true'});assert.ok(Math.abs(persistent.driverSessionUntil-persistent.driverSessionStartedAt-7*86400000)<1000);
 assert.equal(await active.login({login:base.email,password:'wrong',driverOnly:'true'}),null);
 assert.equal(await authorization({...base,active:false}).login({login:base.email,password:'correct',driverOnly:'true'}),null);
 assert.equal(await authorization({...base,mustChangePassword:true}).login({login:base.email,password:'correct',driverOnly:'true'}),null);
 assert.equal(await authorization(base,false).login({login:base.email,password:'correct',driverOnly:'true'}),null);
 const owner=authorization({...base,mustChangePassword:true,organizations:[{...base.organizations[0],role:'OWNER'}]});assert.equal(await owner.login({login:base.email,password:'correct',driverOnly:'true'}),null);assert.ok(await owner.login({login:base.email,password:'correct'}));
 const central=authorization(base,true,true);assert.equal(await central.login({login:base.email,password:'correct',driverOnly:'true'}),null);const admin=await central.login({login:base.email,password:'correct'});assert.ok(admin);assert.equal(admin.driverSessionUntil,undefined);const adminToken=authConfig.callbacks.jwt({token:{},user:admin} as any);assert.equal(adminToken.driverSessionUntil,undefined);
});

test('platform identity guard coexists with unapplied migration, protects any operator record and fails closed on database errors',async()=>{
 const data=isolated('src/lib/platform/identity.ts',{'server-only':{}});
 assert.equal(await data.isPlatformIdentity({$queryRaw:async()=>[{ready:false}]},'user'),false);
 const client={$queryRaw:async()=>[{ready:true}],platformOperator:{findUnique:async(q:any)=>{assert.deepEqual(q,{where:{userId:'user'},select:{id:true}});return {id:'operator'};}}};
 assert.equal(await data.isPlatformIdentity(client,'user'),true);
 await assert.rejects(data.isPlatformIdentity({$queryRaw:async()=>{throw Error('offline');}},'user'),/offline/);
});

test('tenant cannot change credentials of a central operator or an account linked to another organization',async()=>{
 for(const central of [true,false]){
  let writes=0;const account={id:'user',email:'old@example.com',organizations:[{organizationId:central?'own-org':'foreign-org',role:'DRIVER'}]};
  const tx={driver:{findFirst:async(q:any)=>{assert.equal(q.where.organizationId,'own-org');return {id:'driver',userId:'user'};},update:async()=>{writes++;}},user:{findUnique:async(q:any)=>q.where.id==='user'?account:null,update:async()=>{writes++;}}};
  const data=isolated('src/lib/data/drivers.ts',{'server-only':{},'@/lib/platform/identity':{isPlatformIdentity:async()=>central},'@/lib/db':{},'@/lib/auth/password':{},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'own-org');return work(tx);}},'@/lib/platform/quotas':{},'@/lib/data/driver-schedules':{},'@/lib/driver-schedule':{},'@/lib/data/driver-link':{driverMultiStoreReady:async()=>true}});
  await assert.rejects(data.setDriverEmail('own-org','driver','new@example.com','actor'),/plataforma|outra loja/);assert.equal(writes,0);
 }
});

test('revoked driver sessions remain blocked after reactivation and a new authenticated session is accepted',async()=>{
 let issued=1000;const imports:any={'next/navigation':{},'./index':{auth:async()=>({user:{id:'user',organizationId:'own-org',driverSessionStartedAt:issued,driverSessionUntil:Date.now()+10000}})},'@/lib/db':{prisma:{user:{findUnique:async()=>({active:true})},organizationUser:{findUnique:async()=>({organizationId:'own-org',role:'DRIVER',active:true})},driver:{findFirst:async(q:any)=>{assert.deepEqual(q.where,{organizationId:'own-org',userId:'user',active:true});return {id:'driver'};}},organization:{findUnique:async()=>({settings:{driverSessionsRevokedAt:{user:new Date(2000).toISOString()}}})}}},'@/lib/permissions':{can:()=>false},'@/lib/operation-error':{OperationError}};
 imports['server-only']={};const data=isolated('src/lib/auth/guards.ts',imports);await assert.rejects(data.requireDriver(),/sessão foi encerrada/);issued=3000;assert.equal((await data.requireDriver()).driver.id,'driver');
});

test('onboarding transaction refuses driver membership even after deactivation, while new accounts remain eligible',async()=>{
 for(const member of [null,{id:'inactive-driver'}]){
  let locks=0;
  const tx:any={$queryRaw:async(_sql:any,userId:string)=>{assert.equal(userId,'user');locks++;},user:{findUnique:async()=>({active:true})},organizationUser:{findFirst:async(q:any)=>{assert.deepEqual(q.where,{userId:'user',OR:[{active:true},{role:'DRIVER'}]});return member;}}};
  const data=isolated('src/lib/data/onboarding-guard.ts',{'server-only':{},'@/lib/operation-error':{OperationError}});
  if(member)await assert.rejects(data.lockOnboardingAccount(tx,'user'),/já possui/);else await data.lockOnboardingAccount(tx,'user');assert.equal(locks,1);
 }
});

function driversData(existing:any,{ready=true,profile=null as any,elsewhere=0}={}){
 const writes:any[]=[];
 const tx:any={driver:{findFirst:async(q:any)=>{assert.deepEqual(q.where,{organizationId:'new-org',userId:'user'});return profile;},count:async()=>elsewhere,create:async(q:any)=>{writes.push(['driver.create',q.data]);return q.data;},update:async(q:any)=>{writes.push(['driver.update',q.data]);return q.data;}},organizationUser:{upsert:async(q:any)=>{writes.push(['membership',q]);}},user:{create:async()=>{throw Error('must reuse the existing account');}}};
 const data=isolated('src/lib/data/drivers.ts',{'server-only':{},'@/lib/db':{prisma:{user:{findUnique:async()=>existing}}},'@/lib/auth/password':{hashPassword:async()=>{throw Error('no password');}},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'new-org');return work(tx);}},'@/lib/platform/quotas':{assertPlatformQuota:async()=>{}},'@/lib/data/driver-schedules':{},'@/lib/driver-schedule':{},'@/lib/data/driver-link':{driverMultiStoreReady:async()=>ready}});
 return {create:()=>data.createDriver('new-org',{name:'Carlos',phone:'',vehicleType:'MOTORCYCLE',active:true,createLogin:true,email:'Driver@Example.com',activationOnly:true}),writes};
}
const driverAccount={id:'user',active:true,organizations:[{organizationId:'own-org',role:'DRIVER',active:true}]};

test('adding an e-mail that already drives for another store links the same account with its own profile and no password change',async()=>{
 const d=driversData(driverAccount,{elsewhere:1});const profile=await d.create();
 assert.equal(profile.organizationId,'new-org');assert.equal(profile.userId,'user');
 const membership=d.writes.find(w=>w[0]==='membership')[1];assert.deepEqual(membership.create,{organizationId:'new-org',userId:'user',role:'DRIVER',active:true,acceptedAt:membership.create.acceptedAt});
});
test('owner or staff e-mails, duplicates in the same store and multi-store before the migration are refused clearly',async()=>{
 await assert.rejects(driversData({...driverAccount,organizations:[{organizationId:'x',role:'OWNER',active:true}]}).create(),/outro tipo de conta/);
 await assert.rejects(driversData(driverAccount,{profile:{id:'p',active:true}}).create(),/já está cadastrado nesta loja/);
 const early=driversData(driverAccount,{ready:false,elsewhere:1});await assert.rejects(early.create(),/atualização do banco/);assert.equal(early.writes.length,0);
 const back=driversData(driverAccount,{ready:false,profile:{id:'p',active:false},elsewhere:1});await back.create();assert.equal(back.writes.find(w=>w[0]==='driver.update')[1].active,true);
});

test('driver login opens the store of the link when the driver works there, otherwise the first active store',async()=>{
 const base={id:'user',name:'Driver',email:'driver@example.com',passwordHash:'hash',active:true,mustChangePassword:false,organizations:[{organizationId:'own-org',role:'DRIVER',organization:{name:'Shop',slug:'shop'}},{organizationId:'second-org',role:'DRIVER',organization:{name:'Second',slug:'second'}}]};
 let config:any;isolated('src/lib/auth/index.ts',{'@/lib/platform/identity':{isPlatformIdentity:async()=>false},'next-auth':{default:(options:any)=>{config=options;return {};}},'next-auth/providers/credentials':{default:(options:any)=>options},'@/lib/db':{prisma:{user:{findUnique:async()=>base,update:async()=>{}},driver:{findMany:async()=>[{organizationId:'own-org'},{organizationId:'second-org'}]}}},'./password':{verifyPassword:async(password:string)=>password==='correct',fakeVerify:async()=>false},'./config':{authConfig:{}}});
 const login=(raw:any)=>config.providers[0].authorize({login:base.email,password:'correct',driverOnly:'true',...raw});
 assert.equal((await login({store:'second'})).organizationId,'second-org');
 assert.equal((await login({store:'unknown'})).organizationId,'own-org');
 assert.equal((await login({})).organizationId,'own-org');
});

test('a driver suspended in the selected store keeps working in another active store',async()=>{
 const imports:any={'server-only':{},'next/navigation':{},'next/headers':{cookies:async()=>({get:()=>({value:'own-org'})})},'./index':{auth:async()=>({user:{id:'user',role:'DRIVER',organizationId:'own-org'}})},'@/lib/db':{prisma:{user:{findUnique:async()=>({active:true})},organizationUser:{findMany:async()=>[{organizationId:'own-org',role:'DRIVER',active:false},{organizationId:'second-org',role:'DRIVER',active:true}]},driver:{findMany:async()=>[{organizationId:'second-org'}]}}},'@/lib/permissions':{can:()=>false},'@/lib/operation-error':{OperationError}};
 const data=isolated('src/lib/auth/guards.ts',imports);
 assert.equal((await data.requireOrg()).organizationId,'second-org');
});
