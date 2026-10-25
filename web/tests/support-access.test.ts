import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import ts from 'typescript';
class AccessError extends Error{}
function harness(){
 let role='SUPPORT',operatorId='operator',blocked=false;const grants=new Map<string,any>();const audits:any[]=[];let reads=0;
 const tx:any={$queryRaw:async()=>[],platformSetting:{create:async(q:any)=>{grants.set(q.data.key,q.data);return q.data;},findUnique:async(q:any)=>grants.get(q.where.key),update:async(q:any)=>{grants.get(q.where.key).value=q.data.value;}},platformAudit:{create:async(q:any)=>{audits.push(q.data);}},organization:{findUnique:async(q:any)=>{reads++;assert.equal(q.where.id,'own-org');return {id:'own-org',name:'Shop',_count:{orders:1,products:2,drivers:1}};}},driver:{findFirst:async(q:any)=>q.where.id==='own-driver'&&q.where.organizationId==='own-org'?{id:'own-driver'}:null,findMany:async(q:any)=>{assert.equal(q.where.organizationId,'own-org');assert.equal(q.where.id,'own-driver');assert.equal(q.select.phone,undefined);return [{id:'own-driver',name:'Driver'}];}},order:{findMany:async(q:any)=>{assert.equal(q.where.organizationId,'own-org');assert.equal(q.where.driverId,'own-driver');assert.equal(q.select.customerPhone,undefined);return [{id:'order'}];}}};
 const imports:any={'server-only':{},'node:crypto':crypto,'@/lib/db':{prisma:{$transaction:async(work:any)=>work(tx)}},'./auth':{requirePlatformRole:async(roles:string[])=>{if(blocked||!roles.includes(role))throw new AccessError('Restrito');return {role,operatorId,userId:'central-user'};},PlatformAccessError:AccessError}};
 const module={exports:{} as any};const code=ts.transpileModule(readFileSync('src/lib/platform/support-access.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',code)((key:string)=>{if(key in imports)return imports[key];throw Error(key);},module,module.exports);
 return {data:module.exports,audits,grants,block:()=>{blocked=true;},role:(value:string)=>{role=value;},operator:(value:string)=>{operatorId=value;},reads:()=>reads};
}
test('tenant and finance roles cannot issue support access and no tenant data is read',async()=>{const h=harness();for(const role of ['FINANCE','OWNER_TENANT']){h.role(role);await assert.rejects(h.data.createSupportAccess('own-org',null,'Atendimento'),/Restrito/);}assert.equal(h.reads(),0);assert.equal(h.audits.length,0);});
test('support grant has a short lifetime, binds exact operator, store and driver and logs reads',async()=>{
 const h=harness();await assert.rejects(h.data.createSupportAccess('own-org','foreign-driver','Atendimento'),/não pertence/);assert.equal(h.grants.size,0);
 const grant=await h.data.createSupportAccess('own-org','own-driver','Pedido de suporte');assert.ok(Date.parse(grant.expiresAt)-Date.parse(grant.createdAt)<=15*60000);assert.equal(h.audits[0].action,'SUPPORT_ACCESS_CREATED');
 await h.data.getSupportSnapshot(grant.id);assert.equal(h.audits.at(-1).action,'SUPPORT_ACCESS_VIEWED');h.operator('other-operator');await assert.rejects(h.data.getSupportSnapshot(grant.id),/outro operador/);await assert.rejects(h.data.revokeSupportAccess(grant.id),/outro operador/);
 h.role('OWNER');await h.data.revokeSupportAccess(grant.id);assert.equal(h.audits.at(-1).action,'SUPPORT_ACCESS_REVOKED');h.operator('operator');await assert.rejects(h.data.getSupportSnapshot(grant.id),/revogado/);
});
test('expired access and later privilege revocation fail closed without another audit read',async()=>{
 const h=harness();const grant=await h.data.createSupportAccess('own-org','own-driver','Atendimento');h.grants.get(`support-access:${grant.id}`).value.expiresAt=new Date(0).toISOString();await assert.rejects(h.data.getSupportSnapshot(grant.id),/expirado/);h.block();await assert.rejects(h.data.getSupportSnapshot(grant.id),/Restrito/);assert.equal(h.audits.length,1);
});
test('sidebar renders Admin Central immediately below Settings only with server-granted central access',()=>{
 const jsx={jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:'fragment'};
 const imports:any={'react':{useState:(v:any)=>[v,()=>{}],useEffect:()=>{}},'react/jsx-runtime':jsx,'next/link':{default:'a'},'lucide-react':{},'@/components/ui/Icon':{},'next/navigation':{usePathname:()=>'/app/caixa'},'@/lib/utils':{cn:(...args:any[])=>args.join(' ')},'@/data/business-copy':{initialsFromName:()=> 'LO'},'@/components/ui/BrandMark':{},'@/lib/schedule':{STORE_OPEN_STATE_LABEL:{OPEN:'Aberta'}}};
 const module={exports:{} as any};const code=ts.transpileModule(readFileSync('src/components/layout/AppSidebar.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)((key:string)=>{if(key in imports)return imports[key];throw Error(key);},module,module.exports);
 function links(node:any):string[]{if(Array.isArray(node))return node.flatMap(links);if(!node||typeof node!=='object')return [];return [...(node.props?.href?[node.props.href]:[]),...links(node.props?.children)];}
 const props={organizationName:'Loja',organizationSlug:'loja',brandColor:'#ff8800',logoUrl:null,roleLabel:'Proprietário',permissions:['MANAGE_SETTINGS'],storeStatus:'OPEN',mobileOpen:false,onCloseMobile(){}};
 const ordinary=links(module.exports.AppSidebar({...props,centralAccess:false}));assert.equal(ordinary.includes('/admin'),false);
 const central=links(module.exports.AppSidebar({...props,centralAccess:true}));assert.equal(central[central.indexOf('/app/configuracoes')+1],'/admin');
});
