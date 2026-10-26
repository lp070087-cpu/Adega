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
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Atendimento</h2>
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

  // Etiquetas, notas e última leitura de cada conversa (guardadas por conversa, desta loja).
  const metaRows = ids.length ? await prisma.platformSetting.findMany({ where: { key: { in: ids.map((id) => `assistant-thread-meta:${id}`) } } }) : [];
  const metaById = new Map(metaRows.map((r) => [r.key.slice('assistant-thread-meta:'.length), r.value as { tags?: string[]; notes?: Array<{ id: string; text: string; by: string; at: string }>; lastReadAt?: string }]));
  const unreadRows = ids.length ? await prisma.$queryRaw<Array<{ threadId: string; n: bigint }>>`
    SELECT m."threadId", count(*)::bigint AS n FROM "AssistantMessage" m
    WHERE m."organizationId" = ${ctx.organizationId} AND m.direction = 'IN' AND m."threadId" = ANY(${ids})
    GROUP BY m."threadId"` : [];
  const unreadSince = await Promise.all(ids.map(async (id) => {
    const since = metaById.get(id)?.lastReadAt;
    if (!since) return [id, Number(unreadRows.find((r) => r.threadId === id)?.n ?? 0)] as const;
    return [id, await prisma.assistantMessage.count({ where: { organizationId: ctx.organizationId, threadId: id, direction: 'IN', createdAt: { gt: new Date(since) } } })] as const;
  }));
  const unreadById = new Map(unreadSince);

  const list: InboxThread[] = threads.map((t) => {
    const last = lastByThread.get(t.id);
    return {
      unread: t.id === conversa ? 0 : unreadById.get(t.id) ?? 0,
      tags: metaById.get(t.id)?.tags ?? [],
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

  const team = (await prisma.organizationUser.findMany({ where: { organizationId: ctx.organizationId, active: true }, select: { userId: true, user: { select: { name: true } } }, take: 50 })).map((m) => ({ id: m.userId, name: m.user.name ?? 'Sem nome' }));
  const assignee = selected ? ((await prisma.platformSetting.findUnique({ where: { key: `assistant-assignee:${selected.id}` } }))?.value as { userId?: string; name?: string } | undefined) : undefined;
  // Painel do cliente: cadastro e últimos pedidos desta loja pelo telefone da conversa.
  let customer: { name: string | null; phone: string; since: string | null; orders: Array<{ id: string; displayId: number; status: string; total: number; createdAt: string }> } | null = null;
  if (selected) {
    const local = selected.contact.startsWith('55') ? selected.contact.slice(2) : selected.contact;
    const phones = [local, selected.contact, `+${selected.contact}`];
    const [record, recent] = await Promise.all([
      prisma.customer.findFirst({ where: { organizationId: ctx.organizationId, phone: { in: phones } }, select: { name: true, createdAt: true } }),
      prisma.order.findMany({ where: { organizationId: ctx.organizationId, customerPhone: { in: phones } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, displayId: true, status: true, total: true, createdAt: true } }),
    ]);
    customer = { name: record?.name ?? null, phone: local, since: record?.createdAt.toISOString() ?? null, orders: recent.map((o) => ({ id: o.id, displayId: o.displayId, status: o.status, total: Number(o.total), createdAt: o.createdAt.toISOString() })) };
  }
  const selectedMeta = selected ? metaById.get(selected.id) : undefined;
  return <AssistantInbox customer={customer} notes={selectedMeta?.notes ?? []} team={team} assignee={selected?.status === 'HUMAN' && assignee?.userId ? { id: assignee.userId, name: assignee.name ?? '' } : null} threads={list} selectedId={selected?.id ?? null} messages={messages} aiEnabled={aiEnabled} webhookVerified={Boolean(channel?.webhookVerifiedAt)} />;
}
