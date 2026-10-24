import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import {registrationSchema,addressSchema,passwordSchema,emailSchema,fullNameSchema,brazilPhoneSchema,safeReturnPath} from '../src/lib/customer-portal/policy';
import * as portalMail from '../src/lib/customer-portal/mail';
import {storeOpenState} from '../src/lib/schedule';
import * as schedule from '../src/lib/schedule';
import {createDriverWithLoginSchema} from '../src/lib/validations/operations';

class OperationError extends Error {}
function isolated(file:string,imports:Record<string,unknown>){
 const module={exports:{} as any};
 const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)((name:string)=>{if(name in imports)return imports[name];throw Error(`Unexpected import ${name}`);},module,module.exports);
 return module.exports;
}
function harness(){
 const calls:any[]=[];const jar=new Map<string,string>();let account:any=null;let session:any=null;let token:any=null;
 const db:any={
  $queryRaw:async()=>Array.from({length:6},()=>({name:'table'})),
  organization:{findUnique:async()=>({id:'org',slug:'shop',name:'Shop',status:'ACTIVE'})},
  customerPortalAccount:{findUnique:async()=>account,findFirst:async()=>account,create:async(q:any)=>{calls.push(['account',q]);account={id:'account',active:true,emailVerifiedAt:null,failedAttempts:0,...q.data};return account;},update:async(q:any)=>{calls.push(['update',q]);account={...account,...q.data};return account;}},
  customerPortalToken:{findFirst:async(q:any)=>q.where.tokenHash&&token?.tokenHash===q.where.tokenHash&&token.expiresAt>new Date()?token:null,create:async(q:any)=>{calls.push(['token',q]);token=q.data;return token;},deleteMany:async(q:any)=>{calls.push(['delete-token',q]);if(q.where.tokenHash){if(!token||token.tokenHash!==q.where.tokenHash||token.expiresAt<=new Date()||(q.where.account?.emailVerifiedAt===null&&account.emailVerifiedAt))return {count:0};token=null;return {count:1};}token=null;return {count:1};}},
  customerPortalSession:{findFirst:async(q:any)=>{calls.push(['session-read',q]);return session;},create:async(q:any)=>{calls.push(['session-create',q]);return q.data;},deleteMany:async(q:any)=>{calls.push(['session-delete',q]);return {count:1};}},
 };
 const policy=awaitPolicy();
 const data=isolated('src/lib/customer-portal/server.ts',{'server-only':{},'node:crypto':crypto,'next/headers':{cookies:async()=>({get:(key:string)=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key:string,value:string,options:any)=>{calls.push(['cookie',key,value,options]);jar.set(key,value);}})},'@/lib/db':{prisma:db},'@/lib/auth/password':{hashPassword:async(value:string)=>`hash:${value}`,verifyPassword:async(value:string,hash:string)=>hash===`hash:${value}`,fakeVerify:async()=>false},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'org');return work(db);}},'@/lib/operation-error':{OperationError},'./policy':policy,'./mail':portalMail});
 return {data,db,calls,jar,setAccount:(value:any)=>{account=value;},account:()=>account,setSession:(value:any)=>{session=value;},setToken:(value:any)=>{token=value;}};
}
function awaitPolicy(){return {registrationSchema,addressSchema,passwordSchema,emailSchema,PORTAL_TABLES:[1,2,3,4,5],validSlug:(slug:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)};}
function environment(t:any){const keys=['CUSTOMER_PORTAL_ENABLED','RESEND_API_KEY','MAIL_FROM','APP_PUBLIC_URL'];const previous=keys.map(key=>process.env[key]);Object.assign(process.env,{CUSTOMER_PORTAL_ENABLED:'true',RESEND_API_KEY:'isolated',MAIL_FROM:'test@example.com',APP_PUBLIC_URL:'https://example.com'});const old=globalThis.fetch;const messages:any[]=[];globalThis.fetch=async(_url,options)=>{messages.push(JSON.parse(String(options?.body)));return new Response('{}',{status:200});};t.after(()=>{keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});globalThis.fetch=old;});return messages;}

const signup={name:'Ana Souza',email:'ana@example.com',phone:'(81) 99999-9999',password:'SafePass123',confirmPassword:'SafePass123',acceptTerms:true};
test('consumer signup validates confirmation, phone and terms, requires no address and rejects oversized bcrypt passwords',()=>{
 const parsed=registrationSchema.parse({...signup,email:'ANA@example.com'});assert.equal(parsed.email,'ana@example.com');assert.equal(parsed.phone,'81999999999');
 assert.equal(registrationSchema.safeParse({...signup,confirmPassword:'wrong'}).success,false);
 assert.equal(registrationSchema.safeParse({...signup,acceptTerms:false}).success,false);
 assert.equal(registrationSchema.safeParse({...signup,phone:'9999'}).success,false);
 assert.equal(registrationSchema.safeParse({...signup,name:'Ana'}).success,true,'sobrenome é opcional');assert.equal(registrationSchema.safeParse({...signup,name:''}).success,false);
 assert.equal(passwordSchema.safeParse('á'.repeat(40)).success,false);
 assert.equal(addressSchema.safeParse({street:'Rua A',number:'1',district:'Centro',city:'Recife',state:'PE',zipCode:'50000000',isDefault:true}).success,true);
});
test('portal remains unavailable with feature disabled or missing tables without querying new models',async t=>{
 environment(t);const h=harness();process.env.CUSTOMER_PORTAL_ENABLED='false';h.db.$queryRaw=async()=>{throw Error('must not query');};assert.equal(await h.data.portalReady(),false);assert.equal(await h.data.portalSession('shop'),null);delete process.env.CUSTOMER_PORTAL_ENABLED;h.db.$queryRaw=async()=>[{name:null}];assert.equal(await h.data.portalReady(),false);assert.equal(h.calls.length,0);
});
test('registration stores only hashed proof and cannot activate without the exact single-use token',async t=>{
 const messages=environment(t),h=harness();assert.equal(await h.data.registerPortalAccount('shop',signup),'verify');assert.equal(h.calls.some(c=>c[0]==='session-create'),false);
 assert.equal(messages.length,1);const raw=new URLSearchParams(new URL(messages[0].text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token')!;
 const stored=h.calls.find(c=>c[0]==='token')[1].data;assert.equal(stored.tokenHash,h.data.portalHash(raw));assert.notEqual(stored.tokenHash,raw);assert.equal(stored.passwordHash,'hash:SafePass123');assert.equal(h.account().emailVerifiedAt,null);
 await assert.rejects(h.data.consumePortalToken('shop','0'.repeat(64)),/inválido|utilizado/);
 await h.data.consumePortalToken('shop',raw);assert.ok(h.account().emailVerifiedAt);assert.ok(h.calls.some(c=>c[0]==='session-delete'));assert.ok(h.calls.some(c=>c[0]==='delete-token'&&!c[1].where.purpose));await assert.rejects(h.data.consumePortalToken('shop',raw),/inválido|utilizado/);
});
test('customer login creates a scoped secure session without staff identity or plain password in cookies',async t=>{
 environment(t);const h=harness();h.setAccount({id:'account',organizationId:'org',email:'ana@example.com',passwordHash:'hash:SafePass123',active:true,emailVerifiedAt:new Date(),failedAttempts:0});
 await assert.rejects(h.data.loginPortalAccount('shop','ana@example.com','wrong',true),/incorretos/);
 await h.data.loginPortalAccount('shop','ana@example.com','SafePass123',true);
 const cookie=h.calls.find(c=>c[0]==='cookie');assert.equal(cookie[3].httpOnly,true);assert.equal(cookie[3].path,'/loja/shop/');assert.equal(cookie[3].sameSite,'lax');assert.equal(cookie[3].maxAge,30*86400);assert.match(cookie[2],/^[a-f0-9]{64}$/);assert.notEqual(h.data.portalCookie('shop'),h.data.portalCookie('other'));
 assert.equal(h.calls.find(c=>c[0]==='session-create')[1].data.tokenHash,h.data.portalHash(cookie[2]));
 await h.data.logoutPortalAccount('shop');assert.equal(h.calls.at(-1)[3].maxAge,0);assert.equal(h.calls.at(-1)[3].path,'/loja/shop/');
});
test('customer session query enforces verified active account and store isolation',async t=>{
 environment(t);const h=harness();h.jar.set(h.data.portalCookie('shop'),'a'.repeat(64));await h.data.portalSession('shop');const query=h.calls.find(c=>c[0]==='session-read')[1];assert.equal(query.where.account.organization.slug,'shop');assert.equal(query.where.account.active,true);assert.deepEqual(query.where.account.emailVerifiedAt,{not:null});assert.equal(query.where.tokenHash,h.data.portalHash('a'.repeat(64)));assert.equal(await h.data.portalSession('other'),null);
});
test('manual store modes override schedule while AUTO preserves schedule and legacy closure',()=>{
 const now=new Date('2026-10-21T06:00:00Z');
 assert.equal(storeOpenState('CLOSED',[],now,'MANUAL_OPEN'),'OPEN');
 assert.equal(storeOpenState('OPEN',[],now,'MANUAL_CLOSED'),'CLOSED');
 assert.equal(storeOpenState('CLOSED',[],now,'AUTO'),'CLOSED');
});

test('opening mode action authorizes the tenant, preserves schedules and records the actor before invalidation',async()=>{
 const updates:any[]=[],events:any[]=[],paths:any[]=[];const settings={openingHours:[{weekday:1,closed:false,periods:[{open:'08:00',close:'17:00'}]}],unrelated:'preserved'};
 const action=isolated('src/app/actions/store-opening.ts',{'next/cache':{revalidatePath:(...args:any[])=>paths.push(args)},'@/lib/auth/guards':{requirePermission:async(permission:string)=>{assert.equal(permission,'MANAGE_ORDERS');return {organizationId:'own-org',user:{id:'operator'}};},toActionError:(error:Error)=>({error:error.message})},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'own-org');return work({organization:{findUniqueOrThrow:async(q:any)=>{assert.equal(q.where.id,'own-org');return {settings,slug:'shop'};},update:async(q:any)=>updates.push(q)},notification:{create:async(q:any)=>events.push(q)}});}},'@/lib/schedule':{STORE_OPENING_MODE_LABEL:{MANUAL_OPEN:'Aberta manualmente'}}});
 assert.equal((await action.setStoreOpeningModeAction('MANUAL_OPEN')).ok,true);assert.equal(updates[0].data.settings.unrelated,'preserved');assert.deepEqual(updates[0].data.settings.openingHours,settings.openingHours);assert.equal(updates[0].data.settings.storeOpeningMode,'MANUAL_OPEN');assert.equal(events[0].data.userId,'operator');assert.ok(paths.some(path=>path[0]==='/loja/shop'));
 assert.equal((await action.setStoreOpeningModeAction('INVALID')).ok,false);assert.equal(updates.length,1);
});

test('driver logout returns to driver PWA while owner logout keeps its original destination',async()=>{
 const destinations:string[]=[];const actions=isolated('src/app/actions/auth.ts',{'@/lib/operation-error':{OperationError:class extends Error{}},'next-auth':{AuthError:class extends Error{}},'next/navigation':{},'@/lib/db':{},'@/lib/auth/password':{},'@/lib/auth':{signOut:async(q:any)=>destinations.push(q.redirectTo)},'@/lib/validations/auth':{},'@/lib/validations/common':{}});
 await actions.driverLogoutAction();await actions.logoutAction();assert.deepEqual(destinations,['/entregador/','/login']);
});

test('customer address editing and deletion reject foreign resources and require explicit deletion confirmation',async()=>{
 let writes=0;const account={id:'own-account',organizationId:'own-org'};
 const tx={customerPortalAddress:{findFirst:async(q:any)=>{assert.equal(q.where.accountId,account.id);return q.where.id==='own-address'?{id:'own-address',isDefault:false}:null;},delete:async(q:any)=>{assert.equal(q.where.accountId,account.id);writes++;},count:async()=>1,updateMany:async()=>{writes++;},update:async()=>{writes++;},create:async()=>{writes++;}}};
 const actions=isolated('src/app/actions/customer-portal.ts',{'zod':{z:requireZod()},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){}},'@/lib/db':{},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'own-org');return work(tx);}},'@/lib/auth/password':{},'@/lib/auth/guards':{toActionError:(error:Error)=>({error:error.message})},'@/lib/operation-error':{OperationError},'@/lib/customer-portal/policy':{fullNameSchema,brazilPhoneSchema,addressSchema,passwordSchema,safeReturnPath},'@/lib/customer-portal/server':{requireCustomerAccount:async()=>account}});
 const form=(id:string,confirm=false)=>{const data=new FormData();data.set('slug','shop');data.set('action','delete-address');data.set('id',id);if(confirm)data.set('confirm','on');return data;};
 assert.equal((await actions.customerPortalAction(undefined,form('own-address'))).ok,false);assert.equal(writes,0);
 assert.equal((await actions.customerPortalAction(undefined,form('foreign-address',true))).ok,false);assert.equal(writes,0);
 assert.equal((await actions.customerPortalAction(undefined,form('own-address',true))).ok,true);assert.equal(writes,1);
});
function requireZod(){return {ZodError:class extends Error{}};}

test('initial driver registration accepts only first name and email without phone or vehicle details',()=>{
 const result=createDriverWithLoginSchema.parse({name:'João',email:'JOAO@example.com'});assert.equal(result.name,'João');assert.equal(result.email,'joao@example.com');assert.equal(result.phone,'');assert.equal(createDriverWithLoginSchema.safeParse({name:'123',email:'bad'}).success,false);
});

test('checkout rechecks manual closure under the tenant lock and links only a valid customer session',async()=>{
 let closed=true,validSession=false,writes=0,created:any;
 const org={id:'org',status:'ACTIVE',storeStatus:'OPEN',settings:{storeOpeningMode:'MANUAL_OPEN'},allowPickup:true,allowOwnDelivery:true,minimumOrder:0,baseDeliveryFee:0,extraKmFee:0};
 const tx:any={$queryRaw:async()=>[{id:'org'}],organization:{findUnique:async()=>({...org,settings:{storeOpeningMode:closed?'MANUAL_CLOSED':'MANUAL_OPEN'}})},customerPortalSession:{findFirst:async(q:any)=>{assert.equal(q.where.account.organizationId,'org');assert.equal(q.where.tokenHash,'session-hash');assert.equal(q.where.accountId,'account');return validSession?{tokenHash:'session-hash'}:null;}},customer:{findUnique:async()=>({id:'legacy-customer',name:'Ana'}),create:async()=>{throw Error('must not duplicate customer');}},order:{findFirst:async()=>null,create:async(q:any)=>{writes++;created=q.data;return {id:'order',displayId:1001,total:10,discount:0,deliveryFee:0};}}};
 const db={organization:{findUnique:async()=>org},product:{findMany:async(q:any)=>{assert.equal(q.where.organizationId,'org');return [{id:'product',name:'Product',organizationId:'org',active:true,available:true,trackStock:true,stock:25,price:10,promotionalPrice:null,combo:null,variations:[],addonGroups:[]}];}},$transaction:async(work:any)=>work(tx),notification:{create:async()=>({})}};
 const data=isolated('src/lib/data/orders.ts',{'server-only':{},'@/lib/schedule':schedule,'node:crypto':crypto,'@/lib/operation-error':{OperationError},'@/lib/db':{prisma:db,toNumber:(value:unknown)=>Number(value??0)},'@/lib/utils':{onlyDigits:(value:string)=>value.replace(/\D/g,'')},'@/lib/data/inventory':{},'@/lib/data/transaction':{},'@/lib/customer-portal/mail':portalMail,'@/lib/data/cash':{},'@/lib/validations/order':{},'@/lib/platform/access':{getCommercialAccess:async()=>({allowNewOrders:true})},'@/lib/order-flow':{readAutoAccept:()=>false},'@/lib/data/growth':{applyCampaignBenefit:async()=>({discount:0,deliveryFee:0})},'@/lib/data/delivery-fee':{normalizeTiers:()=>[]}});
 const customer={customerName:'Ana',customerPhone:'81999999999',deliveryType:'PICKUP',paymentMethod:'CASH'},items=[{productId:'product',quantity:1}],account={id:'account',sessionHash:'session-hash'};
 await assert.rejects(data.createOrderFromCheckout('org',customer,items,account),/não está recebendo/);assert.equal(writes,0);
 closed=false;await assert.rejects(data.createOrderFromCheckout('org',customer,items,account),/sessão mudou/);assert.equal(writes,0);
 validSession=true;await data.createOrderFromCheckout('org',customer,items,account);assert.deepEqual(created.portalLink,{create:{accountId:'account'}});assert.equal(created.organizationId,'org');assert.equal(created.total,10);assert.equal(writes,1);
});

function noMail(t:any){const messages=environment(t);delete process.env.RESEND_API_KEY;return messages;}
test('without a mail provider, signup opens a real session immediately and never pretends to send e-mail',async t=>{
 const messages=noMail(t),h=harness();
 assert.equal(await h.data.registerPortalAccount('shop',signup,true),'session');
 assert.equal(messages.length,0);assert.equal(h.calls.some(c=>c[0]==='token'),false);
 const created=h.calls.find(c=>c[0]==='account')[1].data;assert.equal(created.passwordHash,'hash:SafePass123');assert.equal(created.phone,'81999999999');assert.ok(created.termsAcceptedAt instanceof Date);assert.equal(JSON.stringify(created).includes('"SafePass123"'),false);
 const cookie=h.calls.find(c=>c[0]==='cookie');assert.equal(cookie[3].httpOnly,true);assert.equal(cookie[3].maxAge,30*86400);
 assert.equal(h.calls.find(c=>c[0]==='session-create')[1].data.tokenHash,h.data.portalHash(cookie[2]));
});
test('without a mail provider, duplicate signup is refused and unverified accounts may log in; with a provider they must confirm',async t=>{
 noMail(t);const h=harness();h.setAccount({id:'account',organizationId:'org',email:'ana@example.com',passwordHash:'hash:SafePass123',active:true,emailVerifiedAt:null,failedAttempts:0});
 await assert.rejects(h.data.registerPortalAccount('shop',signup),/Já existe uma conta/);
 await h.data.loginPortalAccount('shop','ana@example.com','SafePass123',false);
 const cookie=h.calls.find(c=>c[0]==='cookie');assert.equal(cookie[3].maxAge,undefined);
 h.jar.set(h.data.portalCookie('shop'),'b'.repeat(64));await h.data.portalSession('shop');assert.equal(h.calls.filter(c=>c[0]==='session-read').at(-1)[1].where.account.emailVerifiedAt,undefined);
 process.env.RESEND_API_KEY='isolated';
 await assert.rejects(h.data.loginPortalAccount('shop','ana@example.com','SafePass123',false),/Confirme seu e-mail/);
});
test('password recovery is truthfully unavailable without provider and does not reveal whether an account exists',async t=>{
 noMail(t);const h=harness();
 await assert.rejects(h.data.requestPortalReset('shop','ana@example.com'),/provedor de envio ainda não foi configurado/);
 process.env.RESEND_API_KEY='isolated';const before=h.calls.length;
 await h.data.requestPortalReset('shop','nobody@example.com');assert.equal(h.calls.length,before);
 h.setAccount({id:'account',organizationId:'org',email:'ana@example.com',passwordHash:'hash:old',active:true,emailVerifiedAt:new Date(),failedAttempts:0});
 await h.data.requestPortalReset('shop','ana@example.com');const token=h.calls.find(c=>c[0]==='token')[1].data;assert.equal(token.purpose,'RESET');assert.ok(token.expiresAt.getTime()-Date.now()<=30*60000);
});
test('reset token sets a new hashed password once and cannot be reused',async t=>{
 const messages=environment(t),h=harness();h.setAccount({id:'account',organizationId:'org',email:'ana@example.com',passwordHash:'hash:old',active:true,emailVerifiedAt:new Date(),failedAttempts:3});
 await h.data.requestPortalReset('shop','ana@example.com');const raw=new URLSearchParams(new URL(messages[0].text.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token')!;
 await assert.rejects(h.data.consumePortalToken('shop',raw,'NewPass1234','different'),/não coincidem/);
 await h.data.consumePortalToken('shop',raw,'NewPass1234','NewPass1234');assert.equal(h.account().passwordHash,'hash:NewPass1234');assert.equal(h.account().failedAttempts,0);
 await assert.rejects(h.data.consumePortalToken('shop',raw,'Other1234','Other1234'),/inválido|utilizado/);
});
test('post-login destinations stay inside the same store and the checkout marker reopens the bag',()=>{
 assert.equal(safeReturnPath('shop','checkout'),'/loja/shop/?finalizar=1');
 assert.equal(safeReturnPath('shop','/loja/shop/conta/pedidos'),'/loja/shop/conta/pedidos');
 for(const bad of ['https://evil.example','//evil.example','/loja/other/conta','/loja/shop//evil','/loja/shop/\\evil',undefined])assert.equal(safeReturnPath('shop',bad),'/loja/shop/conta');
});
test('login action redirects back to checkout only through the validated destination',async()=>{
 const logins:any[]=[];
 const actions=isolated('src/app/actions/customer-portal.ts',{'zod':{z:requireZod()},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){}},'@/lib/db':{},'@/lib/data/transaction':{},'@/lib/auth/password':{},'@/lib/auth/guards':{toActionError:(error:Error)=>({error:error.message})},'@/lib/operation-error':{OperationError},'@/lib/customer-portal/policy':{fullNameSchema,brazilPhoneSchema,addressSchema,passwordSchema,safeReturnPath},'@/lib/customer-portal/server':{loginPortalAccount:async(...args:any[])=>{logins.push(args);}}});
 const form=(voltar:string)=>{const data=new FormData();data.set('slug','shop');data.set('action','login');data.set('email','ana@example.com');data.set('password','x');data.set('remember','on');data.set('voltar',voltar);return data;};
 assert.equal((await actions.customerPortalAction(undefined,form('checkout'))).redirect,'/loja/shop/?finalizar=1');
 assert.equal((await actions.customerPortalAction(undefined,form('https://evil.example'))).redirect,'/loja/shop/conta');
 assert.equal(logins[0][3],true);
});
