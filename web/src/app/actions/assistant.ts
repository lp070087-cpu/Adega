'use server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { requirePlatformRole } from '@/lib/platform/auth';
import { decrypt, encrypt } from '@/lib/crypto';
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
      await tx.organization.update({where:{id:ctx.organizationId},data:{settings:{...settings,assistant:{...settings.assistant,enabled:input.enabled===true}}}});
      await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Atendimento com IA',message:input.enabled?'Ativado pelo responsável da loja.':'Desativado pelo responsável da loja.',href:'/app/atendimento'}});
    });revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
export async function updateAssistantThread(input:{threadId:string;status:'BOT'|'HUMAN'|'CLOSED'}){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');const data=z.object({threadId:z.string().min(1),status:z.enum(['BOT','HUMAN','CLOSED'])}).parse(input);if(!await assistantReady())throw new OperationError('Atendimento indisponível.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{const count=await tx.assistantThread.updateMany({where:{id:data.threadId,organizationId:ctx.organizationId},data:{status:data.status}});if(!count.count)throw new OperationError('Conversa não encontrada.');await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Status do atendimento alterado',message:`Conversa ${data.threadId}: ${data.status}.`,href:'/app/atendimento'}});});revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}
/** Transfere a conversa para outro membro ativo da loja: a IA pausa e o responsável fica registrado. */
export async function transferAssistantThread(input:{threadId:string;userId:string}){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');const data=z.object({threadId:z.string().min(1).max(64),userId:z.string().min(1).max(64)}).parse(input);if(!await assistantReady())throw new OperationError('Atendimento indisponível.');
    const member=await prisma.organizationUser.findFirst({where:{organizationId:ctx.organizationId,userId:data.userId,active:true},select:{user:{select:{name:true}}}});
    if(!member)throw new OperationError('Escolha alguém da equipe desta loja.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{const count=await tx.assistantThread.updateMany({where:{id:data.threadId,organizationId:ctx.organizationId,status:{not:'CLOSED'}},data:{status:'HUMAN'}});if(!count.count)throw new OperationError('Conversa não encontrada ou encerrada.');
      await tx.notification.create({data:{organizationId:ctx.organizationId,userId:data.userId,type:'SYSTEM',title:'Conversa transferida para você',message:`${ctx.user.name ?? 'A equipe'} transferiu um atendimento do WhatsApp.`,href:`/app/atendimento?conversa=${data.threadId}`}});});
    const key=`assistant-assignee:${data.threadId}`;const value={userId:data.userId,name:member.user.name,at:new Date().toISOString(),by:ctx.user.id};
    await prisma.platformSetting.upsert({where:{key},create:{key,value},update:{value}});
    revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}

export async function processAssistantAction(){try{const ctx=await requirePermission('MANAGE_SETTINGS');const result=await processAssistantInbox(ctx.organizationId);revalidatePath('/app/atendimento');return {ok:true,...result};}catch(error){return {ok:false,...toActionError(error)};}}
export async function retryAssistantMessage(messageId:string){
  try{const ctx=await requirePermission('MANAGE_SETTINGS');if(!await assistantReady())throw new OperationError('Atendimento indisponível.');
    await withOrganizationTransaction(ctx.organizationId,async tx=>{const message=await tx.assistantMessage.findFirst({where:{id:messageId,organizationId:ctx.organizationId,direction:'IN',status:'ERROR',attempts:{lt:3}}});if(!message)throw new OperationError('Mensagem não elegível para nova tentativa.');const reply=await tx.assistantMessage.findUnique({where:{externalId:`reply:${message.id}`}});if(reply&&reply.status!=='RETRYABLE')throw new OperationError('Envio concluído ou incerto. Confira no atendimento humano antes de responder novamente.');if(reply)await tx.assistantMessage.update({where:{id:reply.id},data:{status:'QUEUED'}});await tx.assistantMessage.update({where:{id:message.id},data:{status:'RECEIVED'}});await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Reenvio solicitado',message:`Nova tentativa autorizada para ${message.id}.`,href:'/app/atendimento'}});});revalidatePath('/app/atendimento');return {ok:true};
  }catch(error){return {ok:false,...toActionError(error)};}
}

/**
 * Resposta do atendente pela API oficial. Só com canal verificado e dentro da
 * janela de 24 h aberta pela última mensagem do cliente (regra do WhatsApp).
 * A conversa passa para atendimento humano: a IA para de responder nela.
 */
export async function sendHumanReplyAction(input:{threadId:string;text:string}){
  try{
    const ctx=await requirePermission('MANAGE_SETTINGS');
    const data=z.object({threadId:z.string().min(1).max(100),text:z.string().trim().min(1,'Escreva a mensagem.').max(2000,'Mensagem muito longa.')}).parse(input);
    if(!await assistantReady())throw new OperationError('O WhatsApp oficial ainda não está conectado.');
    const prepared=await withOrganizationTransaction(ctx.organizationId,async tx=>{
      const channel=await tx.assistantChannel.findUnique({where:{organizationId:ctx.organizationId}});
      if(!channel?.enabled||!channel.verifiedAt)throw new OperationError('Conexão oficial do WhatsApp não verificada.');
      const thread=await tx.assistantThread.findFirst({where:{id:data.threadId,organizationId:ctx.organizationId}});
      if(!thread)throw new OperationError('Conversa não encontrada.');
      const lastIn=await tx.assistantMessage.findFirst({where:{organizationId:ctx.organizationId,threadId:thread.id,direction:'IN'},orderBy:{createdAt:'desc'},select:{createdAt:true}});
      if(!lastIn||Date.now()-lastIn.createdAt.getTime()>24*60*60*1000)throw new OperationError('A janela de 24 horas do WhatsApp terminou. O cliente precisa enviar uma nova mensagem antes da resposta.');
      await tx.assistantThread.update({where:{id:thread.id},data:{status:'HUMAN'}});
      const outgoing=await tx.assistantMessage.create({data:{organizationId:ctx.organizationId,threadId:thread.id,externalId:`human:${crypto.randomUUID()}`,direction:'OUT',body:data.text,status:'SENDING',attempts:1}});
      return {channel,thread,outgoing};
    });
    const response=await fetch(`https://graph.facebook.com/${graphVersion()}/${prepared.channel.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${decrypt(prepared.channel.encryptedToken)}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({messaging_product:'whatsapp',to:prepared.thread.contact,type:'text',text:{body:data.text,preview_url:false}})}).catch(()=>null);
    if(!response){await prisma.assistantMessage.update({where:{id:prepared.outgoing.id},data:{status:'UNCERTAIN'}});throw new OperationError('Sem resposta do WhatsApp. Confira antes de reenviar para não duplicar a mensagem.');}
    if(!response.ok){await prisma.assistantMessage.update({where:{id:prepared.outgoing.id},data:{status:'FAILED'}});throw new OperationError('O WhatsApp recusou o envio. Tente novamente.');}
    const result=await response.json().catch(()=>({}));
    await prisma.assistantMessage.update({where:{id:prepared.outgoing.id},data:{status:'SENT',providerMessageId:result?.messages?.[0]?.id??null}});
    revalidatePath('/app/atendimento');
    return {ok:true as const};
  }catch(error){
    if(error instanceof z.ZodError)return {ok:false as const,error:error.issues[0]?.message??'Mensagem inválida.'};
    return {ok:false as const,...toActionError(error)};
  }
}

// ── Organização das conversas (etiquetas, notas internas, leitura) ─────────
export type ThreadMeta = { tags: string[]; notes: Array<{ id: string; text: string; by: string; at: string }>; lastReadAt?: string };
const metaKey = (threadId: string) => `assistant-thread-meta:${threadId}`;
async function ownThread(organizationId: string, threadId: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(threadId)) throw new OperationError('Conversa não encontrada.');
  if (!(await prisma.assistantThread.count({ where: { id: threadId, organizationId } }))) throw new OperationError('Conversa não encontrada.');
}
async function readMeta(threadId: string): Promise<ThreadMeta> {
  const row = await prisma.platformSetting.findUnique({ where: { key: metaKey(threadId) } });
  const v = (row?.value ?? {}) as Partial<ThreadMeta>;
  return { tags: Array.isArray(v.tags) ? v.tags : [], notes: Array.isArray(v.notes) ? v.notes : [], lastReadAt: v.lastReadAt };
}
async function writeMeta(threadId: string, meta: ThreadMeta) {
  await prisma.platformSetting.upsert({ where: { key: metaKey(threadId) }, create: { key: metaKey(threadId), value: meta }, update: { value: meta } });
}

/** Marca a conversa como lida pela equipe (zera o contador de não lidas). */
export async function markThreadReadAction(input: { threadId: string }) {
  try { const ctx = await requirePermission('MANAGE_SETTINGS'); await ownThread(ctx.organizationId, input.threadId); const meta = await readMeta(input.threadId); await writeMeta(input.threadId, { ...meta, lastReadAt: new Date().toISOString() }); return { ok: true as const }; }
  catch (error) { return { ok: false as const, ...toActionError(error) }; }
}

/** Etiquetas da conversa (até 6, cada uma com até 24 caracteres). */
export async function setThreadTagsAction(input: { threadId: string; tags: string[] }) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS'); await ownThread(ctx.organizationId, input.threadId);
    const tags = [...new Set((input.tags ?? []).map((t) => String(t).trim().replace(/\s+/g, ' ')).filter(Boolean))].slice(0, 6);
    if (tags.some((t) => t.length > 24)) throw new OperationError('Etiqueta com até 24 caracteres.');
    const meta = await readMeta(input.threadId); await writeMeta(input.threadId, { ...meta, tags });
    revalidatePath('/app/atendimento'); return { ok: true as const };
  } catch (error) { return { ok: false as const, ...toActionError(error) }; }
}

/** Nota interna: só a equipe vê; nunca é enviada ao cliente. */
export async function addThreadNoteAction(input: { threadId: string; text: string }) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS'); await ownThread(ctx.organizationId, input.threadId);
    const text = String(input.text ?? '').trim();
    if (text.length < 2 || text.length > 500) throw new OperationError('A nota precisa ter de 2 a 500 caracteres.');
    const meta = await readMeta(input.threadId);
    const note = { id: Math.random().toString(36).slice(2, 10), text, by: ctx.user.name ?? 'Equipe', at: new Date().toISOString() };
    await writeMeta(input.threadId, { ...meta, notes: [...meta.notes, note].slice(-50) });
    revalidatePath('/app/atendimento'); return { ok: true as const };
  } catch (error) { return { ok: false as const, ...toActionError(error) }; }
}
