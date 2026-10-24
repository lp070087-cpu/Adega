import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { aiReady, assistantReady } from '@/lib/assistant/service';
import { readAssistantPreferences } from '@/lib/assistant/preferences';
import { AssistantPreferencesForm } from '@/components/assistant/AssistantPreferencesForm';
import { AssistantAiToggle } from '@/components/assistant/AssistantAiToggle';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'WhatsApp' };

/**
 * Configuração do WhatsApp: conexão oficial, IA, regras e mensagens
 * automáticas. As conversas ficam em Atendimento.
 */
export default async function WhatsAppSettings() {
  const { organizationId } = await requireOrgPage('MANAGE_SETTINGS');
  const available = await assistantReady();
  const [channel, org] = await Promise.all([
    available ? prisma.assistantChannel.findUnique({ where: { organizationId }, select: { enabled: true, verifiedAt: true, webhookVerifiedAt: true, dailyLimit: true } }) : null,
    prisma.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }),
  ]);
  const settings = (org?.settings ?? {}) as { assistant?: { enabled?: boolean; preferences?: unknown } };
  const verified = Boolean(channel?.enabled && channel.verifiedAt);
  const receiving = Boolean(verified && channel?.webhookVerifiedAt);
  const ai = aiReady();
  const aiEnabled = Boolean(settings.assistant?.enabled);
  const steps: Array<[string, boolean, string]> = [
    ['Recurso habilitado pela plataforma', available, 'A plataforma ativa o atendimento oficial (banco de dados e chaves do aplicativo Meta).'],
    ['Número oficial conectado e verificado', verified, 'O número da loja é vinculado ao WhatsApp Business Platform e a autorização é testada na Meta.'],
    ['Recebendo mensagens (webhook)', receiving, 'A Meta entrega as mensagens dos clientes ao Del Flash.'],
    ['Serviço de IA configurado', ai, 'Necessário apenas para respostas automáticas. O atendimento humano funciona sem IA.'],
  ];
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">WhatsApp</h1>
        <Link href="/app/atendimento" className="text-sm font-semibold text-brand">Abrir Atendimento</Link>
      </div>
      <section className="space-y-3 rounded-xl border bg-white p-5" data-testid="whatsapp-status">
        <h2 className="font-semibold">Conexão oficial (WhatsApp Business Platform)</h2>
        <ol className="space-y-2">
          {steps.map(([label, done, hint]) => (
            <li key={label} className="flex gap-3">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${done ? 'bg-success text-white' : 'bg-ink-100 text-ink-500'}`}>{done ? '✓' : '•'}</span>
              <span><span className="block text-sm font-semibold text-ink-800">{label} · {done ? 'ok' : 'pendente'}</span><span className="block text-[0.76rem] text-ink-500">{hint}</span></span>
            </li>
          ))}
        </ol>
        {!verified && <p className="rounded-lg bg-ink-50 p-3 text-[0.8rem] text-ink-600">A conexão do número é feita pela equipe da plataforma com o aplicativo oficial da Meta. Nenhuma conexão é criada ao abrir esta página, e nenhuma mensagem é simulada.</p>}
        {channel && <p className="text-[0.76rem] text-ink-500">Limite: {channel.dailyLimit} mensagens processadas por dia.</p>}
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Assistente com IA</h2>
        <p className="text-sm text-ink-500">A IA consulta somente os produtos desta loja e envia links de compra; não confirma pedidos nem preços fora do catálogo. Qualquer conversa pode ser assumida por um atendente em Atendimento.</p>
        <AssistantAiToggle enabled={aiEnabled} canEnable={receiving && ai} />
      </section>
      <AssistantPreferencesForm value={readAssistantPreferences(settings.assistant?.preferences)} />
      <p className="text-sm text-ink-500">Tokens e credenciais ficam no servidor. Esta configuração pertence somente ao seu estabelecimento.</p>
    </div>
  );
}
