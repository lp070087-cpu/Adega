import 'server-only';
import {expectedPayments,reconcilePayments,type PaymentCounts,type PaymentNotes} from '@/lib/cash-reconciliation';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma,toNumber } from '@/lib/db';
import { withOrganizationTransaction } from './transaction';
import { summarizeShift } from './cash';
import { cashHandoffs,type CashHandoff } from '@/lib/cash-handoff-state';
import { can } from '@/lib/permissions';
import { OperationError } from '@/lib/operation-error';

export async function getCashHandoffs(organizationId:string){
 const org=await prisma.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});
 return cashHandoffs(org.settings);
}
export async function proposeCashHandoff(organizationId:string,userId:string,input:{shiftId:string;toUserId:string;amount:number;notes:string;paymentCounts?:PaymentCounts;paymentNotes?:PaymentNotes}){
 return withOrganizationTransaction(organizationId,async tx=>{
  const shift=await tx.cashShift.findFirst({where:{id:input.shiftId,cashRegister:{organizationId}},include:{transactions:true,openedBy:{select:{name:true}},cashRegister:{select:{name:true}}}});
  if(!shift||shift.closedAt)throw new OperationError('Turno indisponível para transferência.');
  if(shift.openedByUserId!==userId)throw new OperationError('A conferência deve ser feita pelo operador responsável pelo turno.');
  if(input.toUserId===userId)throw new OperationError('Escolha outro operador para receber o caixa.');
  const target=await tx.organizationUser.findUnique({where:{organizationId_userId:{organizationId,userId:input.toUserId}},include:{user:{select:{name:true,active:true}}}});
  if(!target?.active||!target.user.active||!can(target.role,'MANAGE_CASH'))throw new OperationError('Operador de destino sem acesso ativo ao caixa.');
  const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});
  const list=cashHandoffs(org.settings);
  if(list.length>=10000)throw new OperationError('Limite de histórico de transferências atingido. O turno permanece aberto para fechamento normal.');
  if(list.some(h=>h.registerId===shift.cashRegisterId&&h.status==='PENDING'))throw new OperationError('Este caixa já aguarda conferência de outro operador.');
  const totals=summarizeShift(shift.openingAmount,shift.transactions.map(t=>({type:t.type,paymentMethod:t.paymentMethod,amount:toNumber(t.amount)})));
  const reconciliation=input.paymentCounts?reconcilePayments(expectedPayments(toNumber(shift.openingAmount),shift.transactions.map(t=>({...t,amount:toNumber(t.amount)}))),input.paymentCounts,shift.id,userId,input.notes,input.paymentNotes):undefined;
  if(input.paymentCounts&&input.paymentCounts.CASH!==input.amount)throw new OperationError('Dinheiro contado difere da conferência.');
  const amount=Math.round(input.amount*100)/100;
  const difference=Math.round((amount-totals.expectedCash)*100)/100;
  const entry:CashHandoff={id:randomUUID(),registerId:shift.cashRegisterId,registerName:shift.cashRegister.name,shiftId:shift.id,fromUserId:userId,fromName:shift.openedBy.name,toUserId:input.toUserId,toName:target.user.name,amount,expected:totals.expectedCash,difference,notes:input.notes,...(reconciliation?{reconciliation}:{}),status:'PENDING',createdAt:new Date().toISOString()};
  await tx.cashShift.update({where:{id:shift.id},data:{closedAt:new Date(),closedByUserId:userId,closingAmount:amount,differenceAmount:difference,notes:`Transferência para ${target.user.name}. ${input.notes}`}});
  const settings=org.settings&&typeof org.settings==='object'&&!Array.isArray(org.settings)?org.settings as Prisma.JsonObject:{};
  await tx.organization.update({where:{id:organizationId},data:{settings:{...settings,cashHandoffs:[...list,entry] as unknown as Prisma.InputJsonValue}}});
  return entry;
 });
}
export async function resolveCashHandoff(organizationId:string,userId:string,input:{id:string;accept:boolean;amount:number;notes:string}){
 return withOrganizationTransaction(organizationId,async tx=>{
  const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{settings:true}});
  const list=cashHandoffs(org.settings);const entry=list.find(h=>h.id===input.id);
  if(!entry||entry.toUserId!==userId)throw new OperationError('Transferência não encontrada para seu usuário.');
  if(entry.status!=='PENDING')throw new OperationError('Esta transferência já foi conferida.');
  if(input.accept){
   const member=await tx.organizationUser.findUnique({where:{organizationId_userId:{organizationId,userId}},include:{user:{select:{active:true}}}});
   if(!member?.active||!member.user.active||!can(member.role,'MANAGE_CASH'))throw new OperationError('Operador sem acesso ativo ao caixa.');
   if(Math.round(input.amount*100)!==Math.round(entry.amount*100))throw new OperationError('O saldo contado difere do saldo transferido. Recuse e registre a divergência antes de abrir outro turno.');
   const register=await tx.cashRegister.findFirst({where:{id:entry.registerId,organizationId,active:true}});
   if(!register)throw new OperationError('Caixa inativo ou indisponível.');
   if(await tx.cashShift.findFirst({where:{cashRegisterId:entry.registerId,closedAt:null}}))throw new OperationError('O caixa já possui um turno aberto.');
   const shift=await tx.cashShift.create({data:{cashRegisterId:entry.registerId,openedByUserId:userId,openingAmount:entry.amount,notes:`Saldo recebido de ${entry.fromName}. Transferência ${entry.id}. ${input.notes}`}});
   entry.newShiftId=shift.id;entry.status='ACCEPTED';
  }else{entry.status='REJECTED';}
  entry.acceptedAt=new Date().toISOString();entry.resolution=input.notes;entry.receivedAmount=Math.round(input.amount*100)/100;
  const settings=org.settings&&typeof org.settings==='object'&&!Array.isArray(org.settings)?org.settings as Prisma.JsonObject:{};
  await tx.organization.update({where:{id:organizationId},data:{settings:{...settings,cashHandoffs:list as unknown as Prisma.InputJsonValue}}});
  return entry;
 });
}
