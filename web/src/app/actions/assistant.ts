'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { requirePlatformRole } from '@/lib/platform/auth';
import { encrypt } from '@/lib/crypto';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { aiReady, assistantReady, graphVersion, processAssistantInbox } from '@/lib/assistant/service';
import { OperationError } from '@/lib/operation-error';
import { z } from 'zod';

export async function configureAssistantChannel(form:FormData){
  try{
    const operator=await requirePlatformRole(['OWNER','ADMIN']);
    if(!await assistantReady())throw new OperationError('Ativação e migração do atendimento pendentes.');
    const data=z.object({organizationId:z.string().min(1),phoneNumberId:z.string().regex(/^\d{5,30}$/),token:z.string().min(20).max(4000),dailyLimit:z.coerce.number().int().min(1).max(10000),reason:z.string().min(5).max(300),confirmation:z.literal('CONFIRMAR')}).parse(Object.fromEntries(form));
    const org=await prisma.organization.findUnique({where:{id:data.organizationId},select:{id:true}});if(!org)throw new OperationError('Estabelecimento inexistente.');
    // A autenticação é testada no provedor; digitar dados nunca marca conexão verificada.
    const response=await fetch(`https://graph.facebook.com/${graphVersion()}/${data.phoneNumberId}?fields=id,verified_name`,{headers:{Authorization:`Bearer ${data.token}`},signal:AbortSignal.timeout(12000),cache:'no-store'});
    if(!response.ok||(await response.json()).id!==data.phoneNumberId)throw new OperationError('A autorização do número não pôde ser verificada.');
    await prisma.$transaction(async tx=>{
      const channel=await tx.assistantChannel.upsert({where:{organizationId:data.organizationId},create:{organizationId:data.organizationId,phoneNumberId:data.phoneNumberId,encryptedToken:encrypt(data.token),dailyLimit:data.dailyLimit,enabled:true,verifiedAt:new Date()},update:{phoneNumberId:data.phoneNumberId,encryptedToken:encrypt(data.token),dailyLimit:data.dailyLimit,enabled:true,verifiedAt:new Date(),webhookVerifiedAt:null}});
      await tx.platformAudit.create({data:{operatorId:operator.operatorId,action:'CONFIGURE_WHATSAPP',resourceType:'AssistantChannel',resourceId:channel.id,reason:data.reason,details:{organizationId:data.organizationId,dailyLimit:data.dailyLimit}}});
    });
    revalidatePath('/admin/servicos');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
export async function assistantSettings(input:{enabled:boolean}){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');if(!await assistantReady())throw new OperationError('Aguardando conexão e ativação da plataforma.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{
      const channel=await tx.assistantChannel.findUnique({where:{organizationId:ctx.organizationId}});
      if(input.enabled===true&&(!aiReady()||!channel?.enabled||!channel.verifiedAt||!channel.webhookVerifiedAt))throw new OperationError('Conexão oficial e serviço de IA ainda não verificados.');
      const org=await tx.organization.findUnique({where:{id:ctx.organizationId},select:{settings:true}});const settings=(org?.settings??{}) as Record<string,any>;
      await tx.organization.update({where:{id:ctx.organizationId},data:{settings:{...settings,assistant:{enabled:input.enabled===true}}}});
      await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Atendimento com IA',message:input.enabled?'Ativado pelo responsável da loja.':'Desativado pelo responsável da loja.',href:'/app/atendimento'}});
    });revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
export async function updateAssistantThread(input:{threadId:string;status:'BOT'|'HUMAN'|'CLOSED'}){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');const data=z.object({threadId:z.string().min(1),status:z.enum(['BOT','HUMAN','CLOSED'])}).parse(input);if(!await assistantReady())throw new OperationError('Atendimento indisponível.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{const count=await tx.assistantThread.updateMany({where:{id:data.threadId,organizationId:ctx.organizationId},data:{status:data.status}});if(!count.count)throw new OperationError('Conversa não encontrada.');await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Status do atendimento alterado',message:`Conversa ${data.threadId}: ${data.status}.`,href:'/app/atendimento'}});});revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
export async function processAssistantAction(){try{const ctx=await requirePermission('MANAGE_SETTINGS');const result=await processAssistantInbox(ctx.organizationId);revalidatePath('/app/atendimento');return {ok:true,...result};}catch(error){return {ok:false,...toActionError(error)};}}
export async function retryAssistantMessage(messageId:string){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');if(!await assistantReady())throw new OperationError('Atendimento indisponível.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{const message=await tx.assistantMessage.findFirst({where:{id:messageId,organizationId:ctx.organizationId,direction:'IN',status:'ERROR',attempts:{lt:3}}});if(!message)throw new OperationError('Mensagem não elegível para nova tentativa.');const reply=await tx.assistantMessage.findUnique({where:{externalId:`reply:${message.id}`}});if(reply&&reply.status!=='RETRYABLE')throw new OperationError('Envio concluído ou incerto. Confira no atendimento humano antes de responder novamente.');if(reply)await tx.assistantMessage.update({where:{id:reply.id},data:{status:'QUEUED'}});await tx.assistantMessage.update({where:{id:message.id},data:{status:'RECEIVED'}});await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Reenvio solicitado',message:`Nova tentativa autorizada para ${message.id}.`,href:'/app/atendimento'}});});revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
