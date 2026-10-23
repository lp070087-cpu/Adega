import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {storeBannerInputSchema} from '../src/lib/validations/store-ops';
import {validateBannerImagePath} from '../src/lib/banner-image';
import {OperationError} from '../src/lib/operation-error';

test('mobile banner positions validate and links refuse executable schemes',()=>{
 const base={title:'Vitrine',imagePath:'/catalog/banners/mobile-cervejas.svg',active:true};
 assert.equal(storeBannerInputSchema.parse(base).placement,'hero');
 for(const placement of ['hero-mobile','transition:category-1'])assert.equal(storeBannerInputSchema.parse({...base,placement}).placement,placement);
 assert.equal(storeBannerInputSchema.safeParse({...base,placement:'transition:../other'}).success,false);
 assert.equal(storeBannerInputSchema.safeParse({...base,linkUrl:'javascript:alert(1)'}).success,false);
 assert.equal(validateBannerImagePath(base.imagePath),base.imagePath);
 assert.throws(()=>validateBannerImagePath('/catalog/banners/unreviewed.svg'));
});

test('mobile banner reads are scoped and foreign category cannot be linked by a tenant',async()=>{
 const calls:any[]=[];let writes=0;
 const prisma={category:{findFirst:async(q:any)=>{calls.push(q);return null;}},storeBanner:{findMany:async(q:any)=>{calls.push(q);return [];},create:async()=>{writes++;}}};
 const output=ts.transpileModule(readFileSync('src/lib/data/store-ops.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{} as any};
 const imports:Record<string,unknown>={'server-only':{},'@/lib/db':{prisma},'@/lib/schedule':{},'@/lib/data/delivery-fee':{},'@/lib/data/transaction':{},'@/lib/operation-error':{OperationError}};
 new Function('require','module','exports',output)((key:string)=>{if(key in imports)return imports[key];throw Error(key);},module,module.exports);
 await module.exports.getPublicMobileBanners('own-org');
 assert.deepEqual(calls[0].where,{organizationId:'own-org',active:true,OR:[{placement:'hero-mobile'},{placement:{startsWith:'transition:'}}]});
 await assert.rejects(module.exports.createStoreBanner('own-org',{placement:'transition:foreign-category',title:'Outro',imagePath:'/catalog/banners/banner-01.png',active:true}),(error:unknown)=>error instanceof OperationError&&/Categoria/.test(error.message));
 assert.deepEqual(calls[1].where,{id:'foreign-category',organizationId:'own-org'});assert.equal(writes,0);
});
