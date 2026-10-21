import { z } from 'zod';
import {parseMoneyInput} from './money-input';

export const cashMethods = ['CASH','DEBIT_CARD','CREDIT_CARD','PIX','ONLINE','OTHER'] as const;
export type CashMethod = typeof cashMethods[number];
export const cashMethodLabels:Record<CashMethod,string>={CASH:'Dinheiro',DEBIT_CARD:'Cartão de débito',CREDIT_CARD:'Cartão de crédito',PIX:'Pix',ONLINE:'Pagamento online',OTHER:'Outras formas'};
export const paymentCountsSchema=z.record(z.enum(cashMethods),z.number().finite().min(-1000000).max(1000000).refine(value=>Math.abs(value*100-Math.round(value*100))<0.000001,'Use no máximo dois centavos decimais.'));
export type PaymentCounts=z.infer<typeof paymentCountsSchema>;
export const paymentNotesSchema=z.record(z.enum(cashMethods),z.string().trim().max(300));
export type PaymentNotes=z.infer<typeof paymentNotesSchema>;
export type CashReconciliation={version:1;shiftId:string;actorId:string;createdAt:string;rows:{method:CashMethod;expected:number;reported:number;difference:number;notes?:string}[];expected:number;reported:number;difference:number;notes:string;status:'OPERATOR_CHECKED'};
const cents=(value:number)=>Math.round(value*100);
export function parseConferenceMoney(value:string){const trimmed=value.trim();const negative=trimmed.startsWith('-');const amount=parseMoneyInput(negative?trimmed.slice(1):trimmed);return amount===null?null:negative?-amount:amount;}
export function expectedPayments(opening:number,transactions:{type:string;paymentMethod:string|null;amount:number}[]):PaymentCounts{
 const used=new Set<CashMethod>();
 const result:Record<CashMethod,number>={CASH:cents(opening),DEBIT_CARD:0,CREDIT_CARD:0,PIX:0,ONLINE:0,OTHER:0};
 for(const transaction of transactions){
  const method=cashMethods.includes(transaction.paymentMethod as CashMethod)?transaction.paymentMethod as CashMethod:transaction.paymentMethod===null&&transaction.type==='REFUND'?'CASH':'OTHER';
  if(transaction.type==='SALE'||transaction.type==='REFUND')used.add(method);
  const amount=cents(transaction.amount);
  if(transaction.type==='SALE')result[method]+=amount;
  else if(transaction.type==='REFUND')result[method]-=amount;
  else if(transaction.type==='SUPPLY'||transaction.type==='ADJUSTMENT')result.CASH+=amount;
  else if(transaction.type==='WITHDRAWAL')result.CASH-=amount;
 }
 return Object.fromEntries(cashMethods.filter(method=>['CASH','DEBIT_CARD','CREDIT_CARD','PIX'].includes(method)||used.has(method)).map(method=>[method,result[method]/100])) as PaymentCounts;
}
export function reconcilePayments(expected:PaymentCounts,reported:PaymentCounts,shiftId:string,actorId:string,notes='',methodNotes:PaymentNotes={}):CashReconciliation{
 const values=paymentCountsSchema.parse(reported);
 const observations=paymentNotesSchema.parse(methodNotes);
 const required=cashMethods.filter(method=>['CASH','DEBIT_CARD','CREDIT_CARD','PIX'].includes(method)||expected[method]!==undefined||values[method]!==undefined);
 if(required.some(method=>values[method]===undefined))throw new Error('Confira cada forma de pagamento antes de encerrar.');
 if((values.CASH??0)<0)throw new Error('Dinheiro contado não pode ser negativo.');
 const rows=required.map(method=>({method,expected:expected[method]??0,reported:values[method]!,difference:(cents(values[method]!)-cents(expected[method]??0))/100,notes:observations[method]??''}));
 if(rows.some(row=>row.difference!==0&&(row.notes||notes).trim().length<5))throw new Error('Justifique as divergências da conferência.');
 const sum=(key:'expected'|'reported'|'difference')=>rows.reduce((total,row)=>total+cents(row[key]),0)/100;
 return {version:1,shiftId,actorId,createdAt:new Date().toISOString(),rows,expected:sum('expected'),reported:sum('reported'),difference:sum('difference'),notes:notes.trim(),status:'OPERATOR_CHECKED'};
}
