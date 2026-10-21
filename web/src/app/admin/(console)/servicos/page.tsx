import { requirePlatformPage } from '@/lib/platform/auth';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assistantReady,aiReady } from '@/lib/assistant/service';
import { storageStatus } from '@/lib/storage';
import { ChannelSetup } from '@/components/assistant/AssistantConsole';
export default async function PlatformServices(){
 const operator=await requirePlatformPage();if(!['OWNER','ADMIN'].includes(operator.role))notFound();const ready=await assistantReady();
 const organizations=await prisma.organization.findMany({select:{id:true,name:true},orderBy:{name:'asc'},take:500});
 const channels=ready?await prisma.assistantChannel.findMany({select:{id:true,organizationId:true,enabled:true,verifiedAt:true,webhookVerifiedAt:true,dailyLimit:true}}):[];
 const storage=storageStatus();
 return <><h1>Serviços e conexões</h1><p>Configuração exclusiva da plataforma. Nenhum segredo é devolvido aos estabelecimentos.</p><div className="platform-panel"><h2>Disponibilidade</h2><ul><li>WhatsApp: {ready?'Estrutura disponível':'Ativação e migração pendentes'}</li><li>Serviço de IA: {aiReady()?'Credenciais configuradas; operação depende de verificação do canal':'Aguardando credenciais e modelo autorizado'}</li><li>Armazenamento: {storage.configured?'Configurado':'Aguardando configuração do provedor'}</li><li>Assinaturas SaaS: <a href="/admin/asaas">Asaas — configuração e homologação Sandbox</a>. Cobranças de produção bloqueadas.</li><li>Pagamento dos pedidos da loja: integração independente, ainda não ativada.</li><li>Entrega: operação própria disponível; provedores externos não conectados</li></ul><p>Chaves globais de IA, assinatura de webhooks e armazenamento ficam nas variáveis protegidas do servidor. Ativação no ambiente exige operador autorizado; nenhuma tela do estabelecimento permite alterá-las.</p></div><div className="platform-panel"><h2>WhatsApp por estabelecimento</h2>{ready?<ChannelSetup organizations={organizations}/>:<p>Aplique somente a migração aprovada e ative a flag do atendimento após configurar os serviços.</p>}{channels.map(c=><p key={c.id}>{organizations.find(o=>o.id===c.organizationId)?.name??'Estabelecimento'} · {c.verifiedAt&&c.webhookVerifiedAt?'Autorização e webhook verificados':'Aguardando verificação completa'} · limite diário {c.dailyLimit}</p>)}</div></>;
}
