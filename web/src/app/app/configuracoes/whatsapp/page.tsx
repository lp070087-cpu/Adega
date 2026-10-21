import Link from 'next/link';
import {requireOrgPage} from '@/lib/auth/guards';
import {assistantReady} from '@/lib/assistant/service';
import {prisma} from '@/lib/db';
export default async function WhatsAppSettings(){
 const {organizationId}=await requireOrgPage('MANAGE_SETTINGS');
 const available=await assistantReady();
 const channel=available?await prisma.assistantChannel.findUnique({where:{organizationId},select:{enabled:true,verifiedAt:true,webhookVerifiedAt:true,phoneNumberId:true}}):null;
 const verified=Boolean(channel?.enabled&&channel.verifiedAt&&channel.webhookVerifiedAt);
 const status=verified?'Conectado e verificado':channel?(channel.enabled?'Atenção necessária':'Desconectado'):'Não conectado';
 return <div className="max-w-3xl space-y-5"><h1 className="text-xl font-bold">WhatsApp</h1><section className="ui-card rounded-xl border bg-white p-5 space-y-4"><h2 className="font-semibold">WhatsApp Business oficial</h2><p role="status">{status}</p><p className="text-sm text-ink-500">Conecte uma conta comercial elegível pela plataforma oficial da Meta. A disponibilidade do número e a coexistência com o Business App dependem de autorização e elegibilidade.</p><button type="button" disabled className="rounded-lg bg-ink-200 px-4 py-3 font-semibold text-ink-500">Conectar WhatsApp Business</button><p className="text-sm text-ink-500">Aguardando habilitação do Embedded Signup e das permissões do aplicativo Meta pela plataforma. Nenhuma conexão é criada ao abrir esta página.</p>{verified&&<Link className="inline-block py-3 font-semibold text-brand" href="/app/atendimento">Configurar IA, conversas e atendimento humano</Link>}</section><p className="text-sm text-ink-500">Tokens e credenciais permanecem no servidor. Esta configuração pertence somente ao seu estabelecimento.</p></div>;
}
