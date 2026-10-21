'use client';
import { useState } from 'react';
import { MoneyInput } from '@/components/ui';
import { parseConferenceMoney,expectedPayments,cashMethods,cashMethodLabels,type PaymentCounts,type PaymentNotes } from '@/lib/cash-reconciliation';
import { parseMoneyInput,formatMoneyInput } from '@/lib/money-input';
import { formatBRL } from '@/lib/utils';

export function PaymentConference({opening,transactions,onChange,onNotesChange,cashValue,onCashChange}:{opening:number;transactions:{type:string;paymentMethod:string|null;amount:number}[];onChange?:(counts:PaymentCounts)=>void;onNotesChange?:(notes:PaymentNotes)=>void;cashValue?:string;onCashChange?:(value:string)=>void}){
 const [notes,setNotes]=useState<PaymentNotes>({});const expected=expectedPayments(opening,transactions);const [values,setValues]=useState<Record<string,string>>({});
 const methods=cashMethods.filter(method=>['CASH','DEBIT_CARD','CREDIT_CARD','PIX'].includes(method)||expected[method]!==undefined);
 const raw=(method:string)=>method==='CASH'&&cashValue!==undefined?cashValue:values[method]??'';
 const counts=()=>Object.fromEntries(methods.map(method=>[method,parseConferenceMoney(raw(method))??NaN])) as PaymentCounts;
 const report=counts(),complete=methods.every(method=>Number.isFinite(report[method]));
 function update(method:string,value:string){const next={...values,[method]:value};setValues(next);if(method==='CASH')onCashChange?.(value);onChange?.(Object.fromEntries(methods.map(key=>[key,parseConferenceMoney(key===method?value:raw(key))??NaN])) as PaymentCounts);}
 const totalExpected=methods.reduce((sum,key)=>sum+Math.round((expected[key]??0)*100),0)/100;
 const totalReported=methods.reduce((sum,key)=>sum+Math.round((report[key]??0)*100),0)/100;
 return <section className="min-w-0 space-y-3 sm:col-span-2"><p className="text-sm text-ink-600">Conte o dinheiro físico. Para cartões e Pix, confira os registros e comprovantes. Esta conferência do operador não representa conciliação com banco ou adquirente.</p>{methods.map(method=><div key={method} className="grid min-w-0 gap-2 rounded-lg bg-ink-50 p-3 sm:grid-cols-2"><div><p className="text-sm font-semibold">{cashMethodLabels[method]}</p><p className="text-xs text-ink-500">Esperado no sistema: {formatBRL(expected[method]??0)}</p></div><label className="min-w-0 text-xs">{method==='CASH'?'Dinheiro contado':'Valor conferido'}<MoneyInput name={`payment_${method}`} aria-label={`${cashMethodLabels[method]} conferido`} required value={raw(method)} onChange={event=>update(method,event.target.value)} onBlur={event=>update(method,formatMoneyInput(event.target.value))} placeholder="0,00"/></label>{Number.isFinite(report[method])&&<p className="text-xs sm:col-span-2">Diferença: {formatBRL((Math.round(report[method]!*100)-Math.round((expected[method]??0)*100))/100)}</p>}<label className="text-xs sm:col-span-2">Observações da forma de pagamento<input name={`payment_note_${method}`} maxLength={300} value={notes[method]??''} onChange={event=>{const next={...notes,[method]:event.target.value};setNotes(next);onNotesChange?.(next);}} className="mt-1 min-h-10 w-full rounded border border-ink-200 bg-white px-3"/></label></div>)}<div className="rounded-lg border border-ink-200 p-3 text-sm"><p>Total esperado: <strong>{formatBRL(totalExpected)}</strong></p><p>Total conferido: <strong>{complete?formatBRL(totalReported):'Preencha todas as formas'}</strong></p><p>Divergência: <strong>{complete?formatBRL((Math.round(totalReported*100)-Math.round(totalExpected*100))/100):'—'}</strong></p></div></section>;
}
