import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as reconciliation from '../src/lib/cash-reconciliation';
import {expectedPayments,reconcilePayments} from '../src/lib/cash-reconciliation';
import * as money from '../src/lib/money-input';
import * as handoffs from '../src/lib/cash-handoff-state';
import * as crypto from 'node:crypto';
class OperationError extends Error{}
function isolated(file:string,imports:Record<string,unknown>){const module={exports:{} as any};const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;new Function('require','module','exports',code)((name:string)=>{if(name in imports)return imports[name];throw Error(`Unexpected import ${name}`);},module,module.exports);return module.exports;}
test('Brazilian monetary input preserves cents, thousands, clearing and rejects malformed grouping',()=>{
 for(const [input,expected]of [['0,01',.01],['10,50',10.5],['1.234,56',1234.56],['10.000,00',10000],['1.234',1234],['25.50',25.5]] as const)assert.equal(money.parseMoneyInput(input),expected);
 assert.equal(money.formatMoneyInput('10000'),'10.000,00');assert.equal(money.formatMoneyInput(''),'');assert.equal(money.parseMoneyInput('12.34,56'),null);assert.equal(money.parseMoneyInput('1,234'),null);
});
const transactions=[{type:'SALE',paymentMethod:'CASH',amount:10.5},{type:'SALE',paymentMethod:'DEBIT_CARD',amount:40},{type:'SALE',paymentMethod:'CREDIT_CARD',amount:60},{type:'SALE',paymentMethod:'PIX',amount:80},{type:'REFUND',paymentMethod:'PIX',amount:5},{type:'WITHDRAWAL',paymentMethod:'CASH',amount:5},{type:'SUPPLY',paymentMethod:'CASH',amount:10}];
test('conference separates physical cash and net digital receipts without inventing reconciliation',()=>{
 const expected=expectedPayments(100,transactions);assert.equal(expected.CASH,115.5);assert.equal(expected.DEBIT_CARD,40);assert.equal(expected.CREDIT_CARD,60);assert.equal(expected.PIX,75);
 const report=reconcilePayments(expected,{CASH:115.5,DEBIT_CARD:40,CREDIT_CARD:60,PIX:75},'shift','operator');assert.equal(report.expected,290.5);assert.equal(report.reported,290.5);assert.equal(report.difference,0);assert.equal(report.status,'OPERATOR_CHECKED');
 const changed=reconcilePayments(expected,{CASH:110.5,DEBIT_CARD:45,CREDIT_CARD:60,PIX:75},'shift','operator','',{CASH:'Falta identificada',DEBIT_CARD:'Comprovante excedente'});assert.equal(changed.difference,0);assert.equal(changed.rows[0].difference,-5);assert.equal(changed.rows[1].difference,5);
 assert.throws(()=>reconcilePayments(expected,{CASH:110.5,DEBIT_CARD:45,CREDIT_CARD:60,PIX:75},'shift','operator'),/Justifique/);
 assert.throws(()=>reconcilePayments(expected,{CASH:115.5},'shift','operator'),/cada forma/);
 assert.throws(()=>reconcilePayments(expected,{CASH:-1,DEBIT_CARD:40,CREDIT_CARD:60,PIX:75},'shift','operator','Justificada'),/negativo/);
 assert.equal(expectedPayments(0,[{type:'SALE',paymentMethod:null,amount:5}]).OTHER,5);
 assert.equal(reconciliation.parseConferenceMoney('-10,50'),-10.5);
});
test('cash close serializes competing requests, saves immutable conference and preserves settings without fake transactions',async()=>{
 let settings:any={keep:true};let closed=false,writes=0;let tail=Promise.resolve();
 const tx:any={organization:{findUniqueOrThrow:async()=>({settings}),update:async(q:any)=>{settings=q.data.settings;}},cashShift:{findFirst:async(q:any)=>{assert.equal(q.where.cashRegister.organizationId,'own');return {id:'shift',openedByUserId:'op',closedAt:closed?new Date():null,openingAmount:100,transactions,cashRegister:{name:'Caixa'}};},update:async(q:any)=>{closed=true;writes++;return {...q.data,id:'shift'};}}};
 const data=isolated('src/lib/data/cash.ts',{'server-only':{},'@/lib/cash-reconciliation':reconciliation,'@/lib/operation-error':{OperationError},'@/lib/db':{prisma:{},toNumber:Number},'@/lib/data/transaction':{withOrganizationTransaction:async(org:string,work:any)=>{assert.equal(org,'own');const result=tail.then(()=>work(tx));tail=result.catch(()=>{});return result;}},'@/lib/utils':{},'@/lib/cash-handoff-state':handoffs});
 const input={cashShiftId:'shift',closingAmount:115.5,paymentCounts:{CASH:115.5,DEBIT_CARD:40,CREDIT_CARD:60,PIX:75}};
 const result=await Promise.allSettled([data.closeCashShift('own',input,'op'),data.closeCashShift('own',input,'op')]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes,1);assert.equal(settings.keep,true);assert.equal(settings.cashReconciliations.shift.actorId,'op');assert.equal(settings.cashReconciliations.shift.expected,290.5);
});
test('cash handoff closes the prior responsibility once and opens only physical cash for its active recipient',async()=>{
 let settings:any={untouched:true};let closed=false;let nextShift=false;let tail=Promise.resolve();
 const tx:any={organization:{findUniqueOrThrow:async()=>({settings}),update:async(q:any)=>{settings=q.data.settings;}},organizationUser:{findUnique:async()=>({active:true,role:'CASHIER',user:{active:true,name:'Novo'}})},cashRegister:{findFirst:async()=>({id:'register'})},cashShift:{findFirst:async(q:any)=>q.where.id?{id:'shift',cashRegisterId:'register',openedByUserId:'old',closedAt:closed?new Date():null,openingAmount:100,transactions,openedBy:{name:'Anterior'},cashRegister:{name:'Caixa'}}:nextShift?{id:'next'}:null,update:async()=>{closed=true;},create:async(q:any)=>{assert.equal(q.data.openingAmount,115.5);assert.equal(q.data.openedByUserId,'new');nextShift=true;return {id:'next'};}}};
 const data=isolated('src/lib/data/cash-handoff.ts',{'server-only':{},'node:crypto':crypto,'@prisma/client':{},'@/lib/cash-reconciliation':reconciliation,'@/lib/db':{prisma:{},toNumber:Number},'./transaction':{withOrganizationTransaction:async(_org:string,work:any)=>{const result=tail.then(()=>work(tx));tail=result.catch(()=>{});return result;}},'./cash':{summarizeShift:()=>({expectedCash:115.5})},'@/lib/cash-handoff-state':handoffs,'@/lib/permissions':{can:()=>true},'@/lib/operation-error':{OperationError}});
 const input={shiftId:'shift',toUserId:'new',amount:115.5,notes:'Conferência correta',paymentCounts:{CASH:115.5,DEBIT_CARD:40,CREDIT_CARD:60,PIX:75}};
 const result=await Promise.allSettled([data.proposeCashHandoff('org','old',input),data.proposeCashHandoff('org','old',input)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(settings.cashHandoffs.length,1);const id=settings.cashHandoffs[0].id;
 await assert.rejects(data.resolveCashHandoff('org','intruder',{id,accept:true,amount:115.5,notes:'Teste'}),/encontrada/);
 await data.resolveCashHandoff('org','new',{id,accept:true,amount:115.5,notes:'Conferido'});assert.equal(nextShift,true);assert.equal(settings.cashHandoffs[0].status,'ACCEPTED');assert.equal(settings.cashHandoffs[0].reconciliation.expected,290.5);assert.equal(settings.untouched,true);
 await assert.rejects(data.resolveCashHandoff('org','new',{id,accept:true,amount:115.5,notes:'Repetida'}),/já/);
});
test('shared currency component preserves typing and deletion even when parent immediately reformats values',()=>{
 let state='',ref={current:false};const effects:any[]=[];const react={forwardRef:(value:any)=>value,useState:(init:any)=>{state=typeof init==='function'?init():init;return [state,(value:string)=>{state=value;}];},useRef:()=>ref,useEffect:(effect:any)=>effects.push(effect),createElement:(type:any,props:any,...children:any[])=>({type,props,children})};
 const data=isolated('src/components/ui/index.tsx',{'react':react,'@/lib/money-input':money,'@/lib/utils':{cn:(...args:any[])=>args.filter(Boolean).join(' ')},'lucide-react':{},'./Icon':{},'./AnimatedMoney':{},'react-dom':{createPortal:(node:any)=>node}});
 const values:string[]=[];const tree=data.MoneyInput({value:'10000.00',onChange:(event:any)=>values.push(event.target.value)});assert.equal(state,'10.000,00');const input=tree.children.find((node:any)=>node?.type==='input');input.props.onFocus({});input.props.onChange({target:{value:'10,'}});assert.equal(state,'10,');input.props.onChange({target:{value:''}});assert.equal(state,'');input.props.onChange({target:{value:'10,50'}});input.props.onBlur({currentTarget:{value:'10,50'}});assert.equal(state,'10,50');assert.deepEqual(values,['10,','','10,50']);assert.equal(input.props.type,'text');
});
