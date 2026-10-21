import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLATFORM_BRAND,brandRgb } from '../src/lib/brand';
import { customerManifest } from '../src/lib/pwa';
import { assistantPreferencesSchema,assistantWithinHours,defaultAssistantPreferences } from '../src/lib/assistant/preferences';
import ts from 'typescript';

test('Del Flash rebrand retains installed identities and provides real maskable icons for all three apps',()=>{
  const panel=JSON.parse(readFileSync('public/pwa/panel.webmanifest','utf8'));
  const driver=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  const customer=customerManifest({slug:'shop',name:'Marca da loja',brandColor:'#AA2200'});
  assert.equal(panel.id,'/app'); assert.equal(driver.id,'/entregador'); assert.equal(customer.id,'/loja/shop');
  assert.equal(panel.name,'Del Flash'); assert.equal(driver.name,'Del Flash Entregador');
  assert.match(customer.name!,/Marca da loja/); assert.equal(customer.theme_color,'#AA2200');
  for (const manifest of [panel,driver,customer]) {
    const icon=manifest.icons.find((item:any)=>item.purpose==='maskable'); assert.ok(icon);
    const png=readFileSync(`public${icon.src}`); assert.equal(png.readUInt32BE(16),512); assert.equal(png.readUInt32BE(20),512);
  }
  assert.equal(PLATFORM_BRAND.navy,'#0B1F3A'); assert.equal(brandRgb('#FF8800'),'255 136 0'); assert.equal(brandRgb('url(secret)'),'8 126 164');
});
test('assistant hours support midnight and use Brasilia timezone rather than host timezone',()=>{
  const preferences={...defaultAssistantPreferences,hoursEnabled:true,days:[1],opens:'22:00',closes:'02:00'};
  assert.equal(assistantWithinHours(preferences,new Date('2026-10-20T04:00:00Z')),true);
  assert.equal(assistantWithinHours(preferences,new Date('2026-10-20T05:00:00Z')),false);
  assert.equal(assistantWithinHours(preferences,new Date('2026-10-21T04:00:00Z')),false);
  assert.equal(assistantPreferencesSchema.safeParse({...preferences,opens:'99:00'}).success,false);
  assert.equal(assistantPreferencesSchema.safeParse({...preferences,closes:'22:00'}).success,false);
});
test('assistant operational preferences are tenant bound, preserve settings and never activate a channel',async()=>{
  let allowed=true; const writes:any[]=[];
  const settings={growth:{existing:true},assistant:{enabled:false}};
  const imports:Record<string,unknown>={ '@/lib/auth/guards':{requirePermission:async()=>{if(!allowed)throw new Error('Forbidden');return {organizationId:'own',user:{id:'actor'}};},toActionError:(error:Error)=>({error:error.message})}, '@/lib/data/transaction':{withOrganizationTransaction:async(id:string,work:any)=>{assert.equal(id,'own');return work({organization:{findUnique:async()=>({settings}),update:async(args:any)=>writes.push(args)},notification:{create:async()=>{}}});}},'@/lib/assistant/preferences':{assistantPreferencesSchema},'next/cache':{revalidatePath(){}} };
  const source=ts.transpileModule(readFileSync('src/app/actions/assistant-preferences.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as any};new Function('require','module','exports',source)((name:string)=>{if(!(name in imports))throw new Error(name);return imports[name];},mod,mod.exports);
  const form=new FormData();form.set('businessPhone','+5581999999999');form.set('opens','09:00');form.set('closes','18:00');form.set('awayMessage','Retornaremos no horário informado.');form.append('days','1');form.set('organizationId','foreign');
  assert.equal((await mod.exports.saveAssistantPreferences(form)).ok,true);
  assert.equal(writes[0].where.id,'own');assert.equal(writes[0].data.settings.assistant.enabled,false);assert.deepEqual(writes[0].data.settings.growth,{existing:true});
  allowed=false;assert.equal((await mod.exports.saveAssistantPreferences(form)).ok,false);assert.equal(writes.length,1);
});
