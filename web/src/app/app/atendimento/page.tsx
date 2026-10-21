import { requireOrgPage } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { assistantReady, aiReady } from '@/lib/assistant/service';
import { AssistantConsole } from '@/components/assistant/AssistantConsole';
export default async function AssistantPage(){
  const ctx=await requireOrgPage('MANAGE_SETTINGS');const active=await assistantReady();
  const [org,channel,threads]=await Promise.all([
    prisma.organization.findUnique({where:{id:ctx.organizationId},select:{settings:true}}),
    active?prisma.assistantChannel.findUnique({where:{organizationId:ctx.organizationId},select:{enabled:true,verifiedAt:true,webhookVerifiedAt:true,dailyLimit:true}}):null,
    active?prisma.assistantThread.findMany({where:{organizationId:ctx.organizationId},take:30,orderBy:{updatedAt:'desc'}}):[],
  ]);
  const enabled=Boolean((org?.settings as any)?.assistant?.enabled);
  const ready=Boolean(channel?.enabled&&channel.verifiedAt&&channel.webhookVerifiedAt&&aiReady());
  const rows=await Promise.all(threads.map(async t=>({...t,messages:(await prisma.assistantMessage.findMany({where:{organizationId:ctx.organizationId,threadId:t.id},take:20,orderBy:{createdAt:'desc'},select:{id:true,direction:true,body:true,status:true,createdAt:true}})).reverse().map(m=>({...m,createdAt:m.createdAt.toISOString()}))})));
  return <div className="space-y-5"><h1 className="text-xl font-bold">Atendimento com IA</h1><div className="rounded-xl border bg-white p-5"><p className="font-semibold">{ready?(enabled?'Atendimento ativado':'Conexão disponível · ativação opcional'):'Aguardando conexão'}</p><p className="mt-2 text-sm text-ink-500">WhatsApp Business Platform oficial. O atendimento consulta produtos desta loja e envia links de compra; não confirma pedidos. {channel?`Limite: ${channel.dailyLimit} mensagens processadas por dia (UTC).`:''}</p>{!active&&<p className="mt-2 text-sm text-ink-500">Disponibilização pela plataforma e migração do atendimento pendentes.</p>}</div><AssistantConsole enabled={enabled} ready={ready} threads={rows}/><p className="text-sm text-ink-500">Custos externos de mensagens e IA são informados pela plataforma e não estão automaticamente incluídos na assinatura.</p></div>;
}
