import { z } from 'zod';
import {parseMoneyInput} from '@/lib/money-input';
export const contractStatuses = ['TRIAL','ACTIVE','PENDING','PAST_DUE','SUSPENDED','CANCELLED'] as const;
export const contractStatusLabel: Record<string,string> = {TRIAL:'Teste',ACTIVE:'Ativa',PENDING:'Pendente',PAST_DUE:'Vencida',SUSPENDED:'Suspensa',CANCELLED:'Cancelada'};
export const moneyInput = z.preprocess(v => typeof v === 'string' ? parseMoneyInput(v)??NaN : v, z.coerce.number().finite().min(0).max(99999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Use até duas casas decimais.'));
export const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'Data inválida.');
export const planSchema = z.object({ id:z.string().optional(), name:z.string().trim().min(2).max(100), slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), description:z.string().trim().max(1000), price:moneyInput, annualPrice:z.union([z.literal(''),moneyInput]), maxUsers:z.coerce.number().int().min(1).max(10000), maxDrivers:z.coerce.number().int().min(0).max(10000), active:z.boolean(), features:z.string().max(3000) });
export const contractSchema = z.object({ organizationId:z.string().min(1).max(100), planId:z.string().min(1).max(100), status:z.enum(contractStatuses), period:z.enum(['MONTHLY','ANNUAL']), startedAt:requiredDate, dueAt:requiredDate, trialEndsAt:z.union([z.literal(''),requiredDate]), enforceAccess:z.boolean(), graceDays:z.coerce.number().int().min(0).max(90) }).refine(v=> v.dueAt >= v.startedAt, {message:'Vencimento deve ser posterior ao início.'}).refine(v=> !v.trialEndsAt || v.trialEndsAt >= v.startedAt, {message:'Fim do teste deve ser posterior ao início.'});
export function effectiveContractStatus(contract: {status:string; dueAt:Date; trialEndsAt:Date|null}, now=new Date()) {
  if (['SUSPENDED','CANCELLED'].includes(contract.status)) return contract.status;
  const expires = contract.status === 'TRIAL' ? (contract.trialEndsAt ?? contract.dueAt) : contract.dueAt;
  if (expires < now && ['ACTIVE','TRIAL'].includes(contract.status)) return 'PAST_DUE';
  return contract.status;
}
export function monthlyCents(amount:unknown, period:string) { const cents=Math.round(Number(String(amount))*100); return period==='ANNUAL' ? Math.round(cents/12) : cents; }
export function commercialPlanData(features: unknown): {description:string; annualPrice:string|null; included:string[]} {
 const f = features && typeof features==='object' && !Array.isArray(features) ? features as Record<string,unknown> : {};
 const c = f.commercial && typeof f.commercial==='object' ? f.commercial as Record<string,unknown> : {};
 return {description:typeof c.description==='string'?c.description:'', annualPrice:typeof c.annualPrice==='string'?c.annualPrice:null, included:Array.isArray(f.features)?f.features.filter((s):s is string=>typeof s==='string'):[]};
}

export function canPlatformSection(role:string,section:string){
 if(role==='OWNER'||role==='ADMIN')return true;
 if(role==='FINANCE')return ['','estabelecimentos','planos','assinaturas','financeiro','asaas'].includes(section);
 if(role==='SUPPORT')return ['estabelecimentos','integracoes','suporte'].includes(section);
 return false;
}
