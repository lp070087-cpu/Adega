import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { aiChecklist, aiReady, assistantReady, whatsappConnectChecklist } from '@/lib/assistant/service';
import { readAssistantPreferences } from '@/lib/assistant/preferences';
import { AssistantPreferencesForm } from '@/components/assistant/AssistantPreferencesForm';
import { AssistantAiToggle } from '@/components/assistant/AssistantAiToggle';
import { WhatsAppConnect } from '@/components/assistant/WhatsAppConnect';
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
  const platform = whatsappConnectChecklist();
  const aiItems = aiChecklist();
  const platformOk = available && platform.every((item) => item.ok);
  const webhookUrl = `${process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app'}/api/whatsapp/webhook`;
  const steps: Array<{ label: string; done: boolean; hint: string }> = [
    { label: 'Plataforma pronta para o WhatsApp oficial', done: platformOk, hint: platformOk ? 'Aplicativo Meta configurado no servidor.' : 'A equipe Del Flash precisa concluir a configuração do aplicativo Meta. O botão abaixo mostra o que falta.' },
    { label: 'Número da loja conectado', done: verified, hint: verified ? 'Autorização do número confirmada pela Meta.' : 'Entre na Meta pelo botão abaixo e escolha o número da loja. Ele só conta como conectado depois que a Meta confirmar.' },
    { label: 'Recebendo mensagens', done: receiving, hint: receiving ? 'A Meta já entregou mensagens desta loja.' : 'Fica ativo quando a primeira mensagem de um cliente chega pelo webhook.' },
    { label: 'Respostas automáticas com IA', done: ai && aiEnabled, hint: !ai ? 'Opcional. Depende da chave do serviço de IA na plataforma.' : aiEnabled ? 'Ativas.' : 'Disponíveis: ative abaixo quando quiser.' },
  ];
  const status = receiving ? { tone: 'bg-success-bg text-success', text: 'Conectado' } : verified ? { tone: 'bg-warn-bg text-warn', text: 'Aguardando mensagens' } : { tone: 'bg-ink-100 text-ink-600', text: 'Não conectado' };
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">WhatsApp</h2>
        <Link href="/app/atendimento" className="text-sm font-semibold text-brand">Abrir Atendimento</Link>
      </div>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Canais de atendimento" data-testid="whatsapp-channels">
        <div className="rounded-xl border-2 border-brand/30 bg-white p-4">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-brand">Canal recomendado</p>
          <p className="mt-1 font-semibold text-ink-900">API oficial da Meta</p>
          <p className="mt-1 text-[0.78rem] text-ink-500">WhatsApp Business Platform: número verificado, webhook assinado, envio pela API oficial e sem risco de bloqueio por automação não autorizada.</p>
          <p className="mt-2 text-[0.76rem] font-semibold text-ink-700">Status abaixo, em “Conexão oficial”.</p>
        </div>
        <div className="rounded-xl border bg-ink-50 p-4" data-testid="whatsapp-web-channel">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-500">Indisponível</p>
          <p className="mt-1 font-semibold text-ink-900">WhatsApp Web (QR Code)</p>
          <p className="mt-1 text-[0.78rem] text-ink-500">Conectar pelo QR Code do WhatsApp Web depende de automações não oficiais, que violam os termos do WhatsApp e podem bloquear o número da loja. Por isso o Del Flash não oferece este modo. Use a API oficial ou o WhatsApp do celular para atender manualmente.</p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-5" data-testid="whatsapp-status">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-900">Conexão oficial (WhatsApp Business Platform)</h3>
          <span className={`rounded-full px-3 py-1 text-[0.74rem] font-bold ${status.tone}`} data-testid="whatsapp-connection">{status.text}</span>
        </div>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={step.label} className="flex gap-3">
              <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold ${step.done ? 'bg-success text-white' : 'bg-ink-100 text-ink-500'}`}>{step.done ? '✓' : i + 1}</span>
              <span><span className="block text-sm font-semibold text-ink-800">{step.label}</span><span className="block text-[0.78rem] text-ink-500">{step.hint}</span></span>
            </li>
          ))}
        </ol>
        <WhatsAppConnect connected={Boolean(channel?.enabled && channel.verifiedAt)} />
        {!receiving && <p className="rounded-lg bg-ink-50 p-3 text-[0.8rem] text-ink-600">Nenhuma conexão é simulada: enquanto estas etapas não forem concluídas, o Atendimento não mostra conversas.</p>}
        {!platformOk && (
          <details className="rounded-lg border border-ink-100 p-3 text-[0.8rem]" data-testid="whatsapp-missing">
            <summary className="cursor-pointer font-semibold text-ink-800">Instruções para a equipe da plataforma</summary>
            <ul className="mt-2 space-y-1">
              {platform.map((item) => <li key={item.key}>{item.ok ? '✓' : '✗'} {item.label} <code className="text-[0.72rem] text-ink-500">{item.key}</code></li>)}
              {aiItems.map((item) => <li key={item.key}>{item.ok ? '✓' : '○'} {item.label} (opcional) <code className="text-[0.72rem] text-ink-500">{item.key}</code></li>)}
            </ul>
            <p className="mt-2 text-ink-500">Crie um aplicativo do tipo Empresa em developers.facebook.com, adicione o produto WhatsApp e o Login do Facebook para Empresas, crie uma configuração de Embedded Signup e copie os valores para as variáveis acima na Vercel.</p>
            <p className="mt-2 text-ink-500">URL do webhook na Meta: <code className="break-all">{webhookUrl}</code> · campo assinado: <code>messages</code>.</p>
          </details>
        )}
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
