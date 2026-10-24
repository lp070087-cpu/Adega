import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { assistantReady, aiReady } from '@/lib/assistant/service';
import { AssistantInbox, type InboxThread, type InboxMessage } from '@/components/assistant/AssistantInbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atendimento' };

/**
 * Central de conversas do WhatsApp oficial. Só mostra conversas reais
 * recebidas pelo webhook; sem conexão, explica como conectar. As
 * configurações (número, IA, regras) ficam em Configurações > WhatsApp.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ conversa?: string }> }) {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const { conversa } = await searchParams;
  const available = await assistantReady();
  const channel = available ? await prisma.assistantChannel.findUnique({ where: { organizationId: ctx.organizationId }, select: { enabled: true, verifiedAt: true, webhookVerifiedAt: true } }) : null;
  const connected = Boolean(channel?.enabled && channel.verifiedAt);

  if (!connected) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold text-ink-900">Atendimento</h1>
        <section className="rounded-xl border border-ink-200 bg-white p-6 text-center" data-testid="inbox-not-connected">
          <p className="text-[1.05rem] font-bold text-ink-900">WhatsApp ainda não conectado</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">As conversas dos clientes aparecem aqui assim que o número oficial da loja estiver conectado ao WhatsApp Business Platform. Nenhuma conversa é exibida antes disso.</p>
          <Link href="/app/configuracoes/whatsapp" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white">Configurar WhatsApp</Link>
        </section>
      </div>
    );
  }

  const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { settings: true } });
  const aiEnabled = Boolean((org?.settings as { assistant?: { enabled?: boolean } } | null)?.assistant?.enabled) && aiReady();
  const threads = await prisma.assistantThread.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { updatedAt: 'desc' }, take: 100 });
  const ids = threads.map((t) => t.id);
  const lastMessages = ids.length
    ? await prisma.assistantMessage.findMany({ where: { organizationId: ctx.organizationId, threadId: { in: ids } }, orderBy: { createdAt: 'desc' }, distinct: ['threadId'], select: { threadId: true, body: true, direction: true, createdAt: true } })
    : [];
  const lastByThread = new Map(lastMessages.map((m) => [m.threadId, m]));
  // Nome do cliente: só quando o telefone já é cliente desta loja.
  const phones = threads.map((t) => (t.contact.startsWith('55') ? t.contact.slice(2) : t.contact));
  const customers = phones.length ? await prisma.customer.findMany({ where: { organizationId: ctx.organizationId, phone: { in: phones } }, select: { name: true, phone: true } }) : [];
  const nameByPhone = new Map(customers.map((c) => [c.phone, c.name]));

  const list: InboxThread[] = threads.map((t) => {
    const last = lastByThread.get(t.id);
    return {
      id: t.id,
      contact: t.contact,
      name: nameByPhone.get(t.contact.startsWith('55') ? t.contact.slice(2) : t.contact) ?? null,
      status: t.status as InboxThread['status'],
      lastMessage: last?.body ?? null,
      lastAt: (last?.createdAt ?? t.updatedAt).toISOString(),
      waiting: last?.direction === 'IN' && t.status !== 'CLOSED',
    };
  });

  const selected = conversa ? threads.find((t) => t.id === conversa) : undefined;
  const messages: InboxMessage[] = selected
    ? (await prisma.assistantMessage.findMany({ where: { organizationId: ctx.organizationId, threadId: selected.id }, orderBy: { createdAt: 'asc' }, take: 300, select: { id: true, direction: true, body: true, status: true, createdAt: true, externalId: true } })).map((m) => ({
        id: m.id,
        author: m.direction === 'IN' ? 'customer' : m.externalId.startsWith('human:') ? 'agent' : 'ai',
        body: m.body,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      }))
    : [];

  return <AssistantInbox threads={list} selectedId={selected?.id ?? null} messages={messages} aiEnabled={aiEnabled} webhookVerified={Boolean(channel?.webhookVerifiedAt)} />;
}
