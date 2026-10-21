import type {CashReconciliation} from './cash-reconciliation';
export type CashHandoff = {
  id:string; registerId:string; registerName:string; shiftId:string; fromUserId:string; fromName:string;
  toUserId:string; toName:string; amount:number; expected:number; difference:number; notes:string;
  reconciliation?:CashReconciliation;
  status:'PENDING'|'ACCEPTED'|'REJECTED'; createdAt:string; acceptedAt?:string; newShiftId?:string; resolution?:string;receivedAmount?:number;
};
export function cashHandoffs(settings:unknown):CashHandoff[]{
  if(!settings||typeof settings!=='object'||Array.isArray(settings))return [];
  const records=(settings as Record<string,unknown>).cashHandoffs;
  return Array.isArray(records)?records.filter((v):v is CashHandoff=>Boolean(v&&typeof v==='object'&&typeof v.id==='string'&&typeof v.registerId==='string'&&['PENDING','ACCEPTED','REJECTED'].includes(v.status))):[];
}
