'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Check, CheckCheck, Clock, Plus, Search, Send, StickyNote, Tag, User, UserRound, X } from 'lucide-react';
import { addThreadNoteAction, markThreadReadAction, sendHumanReplyAction, setThreadTagsAction, transferAssistantThread, updateAssistantThread } from '@/app/actions/assistant';
import { useLiveRefresh } from '@/components/layout/LiveRefresh';
import { Alert, Button } from '@/components/ui';
import { cn, formatBRL, formatPhone } from '@/lib/utils';
import { operationalLabel } from '@/lib/order-presentation';

export type InboxThread = { id: string; contact: string; name: string | null; status: 'BOT' | 'HUMAN' | 'CLOSED'; lastMessage: string | null; lastAt: string; waiting: boolean; unread?: number; tags?: string[] };
export type InboxMessage = { id: string; author: 'customer' | 'ai' | 'agent'; body: string; status: string; createdAt: string };
type Note = { id: string; text: string; by: string; at: string };
type Customer = { name: string | null; phone: string; since: string | null; orders: Array<{ id: string; displayId: number; status: string; total: number; createdAt: string }> } | null;

const FILTERS = [
  ['all', 'Todas'],
  ['unread', 'Não lidas'],
  ['waiting', 'Aguardando'],
  ['BOT', 'IA'],
  ['HUMAN', 'Humano'],
  ['CLOSED', 'Encerradas'],
] as const;
type Filter = (typeof FILTERS)[number][0];
const STATUS_LABEL: Record<InboxThread['status'], string> = { BOT: 'IA', HUMAN: 'Humano', CLOSED: 'Encerrada' };
const DELIVERY: Record<string, string> = { SENDING: 'Enviando', SENT: 'Enviada', DELIVERED: 'Entregue', READ: 'Lida', FAILED: 'Falhou', UNCERTAIN: 'Envio incerto', QUEUED: 'Na fila', CANCELLED: 'Cancelada', RETRYABLE: 'Nova tentativa' };
const TAG_SUGGESTIONS = ['Novo cliente', 'Pedido', 'Dúvida', 'Reclamação', 'VIP', 'Retorno'];

const contactLabel = (thread: InboxThread) => thread.name ?? formatPhone(thread.contact.startsWith('55') ? thread.contact.slice(2) : thread.contact);
function when(iso: string) {
  const date = new Date(iso), now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat('pt-BR', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' }).format(date);
}
function Tick({ status }: { status: string }) {
  if (status === 'READ') return <CheckCheck size={13} className="text-sky-300" aria-label="Lida" />;
  if (status === 'DELIVERED') return <CheckCheck size={13} aria-label="Entregue" />;
  if (status === 'SENT') return <Check size={13} aria-label="Enviada" />;
  if (['SENDING', 'QUEUED', 'RETRYABLE'].includes(status)) return <Clock size={12} aria-label={DELIVERY[status]} />;
  return null;
}

/**
 * Atendimento no estilo WhatsApp Web: conversas à esquerda, chat no centro e
 * painel do cliente à direita (pedidos, etiquetas e notas internas). No celular,
 * uma coluna por vez. Tudo é da loja da sessão; atualiza sozinho.
 */
export function AssistantInbox({ threads, selectedId, messages, aiEnabled, webhookVerified, team = [], assignee = null, customer = null, notes = [] }: { threads: InboxThread[]; selectedId: string | null; messages: InboxMessage[]; aiEnabled: boolean; webhookVerified: boolean; team?: Array<{ id: string; name: string }>; assignee?: { id: string; name: string } | null; customer?: Customer; notes?: Note[] }) {
  const router = useRouter();
  useLiveRefresh('/api/app/atendimento/versao', 4000);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, selectedId]);
  // Abrir a conversa marca como lida (o contador some para a equipe).
  useEffect(() => { if (selectedId) void markThreadReadAction({ threadId: selectedId }); }, [selectedId, messages.length]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return threads.filter((t) => {
      if (filter === 'unread' ? !(t.unread && t.unread > 0) : filter === 'waiting' ? !t.waiting : filter !== 'all' && t.status !== filter) return false;
      if (!term) return true;
      return (t.name ?? '').toLowerCase().includes(term) || (digits.length > 0 && t.contact.includes(digits)) || (t.tags ?? []).some((tag) => tag.toLowerCase().includes(term));
    });
  }, [threads, query, filter]);
  const unreadTotal = threads.reduce((a, t) => a + (t.unread ?? 0), 0);

  const act = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: false; error: string; code?: string } | { ok: true }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(('error' in r && r.error) || 'Não foi possível concluir.');
      else after?.();
      router.refresh();
    });
  };
  const setStatus = (status: InboxThread['status']) => selected && act(() => updateAssistantThread({ threadId: selected.id, status }));
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim() || pending) return;
    const body = text;
    act(() => sendHumanReplyAction({ threadId: selected.id, text: body }) as Promise<{ ok: boolean; error?: string }>, () => setText(''));
  }
  const tags = selected?.tags ?? [];
  const saveTags = (next: string[]) => selected && act(() => setThreadTagsAction({ threadId: selected.id, tags: next }), () => setTagDraft(''));

  const lastCustomer = [...messages].reverse().find((m) => m.author === 'customer');
  const windowOpen = Boolean(lastCustomer && Date.now() - new Date(lastCustomer.createdAt).getTime() < 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-3" data-testid="inbox">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Atendimento {unreadTotal > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 align-middle text-[0.72rem] font-bold text-white" data-testid="inbox-unread-total">{unreadTotal}</span>}</h2>
        <p className="text-[0.76rem] text-ink-500">IA {aiEnabled ? 'ativa' : 'desativada'} · <Link href="/app/configuracoes/whatsapp" className="font-semibold text-brand">Configurar WhatsApp e IA</Link></p>
      </div>
      {!webhookVerified && <Alert tone="warn">Número conectado, mas o WhatsApp ainda não entregou nenhuma mensagem a esta loja. Confira o webhook na configuração do WhatsApp.</Alert>}

      <div className="grid h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-ink-200 bg-white md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Conversas */}
        <aside className={cn('flex min-h-0 flex-col border-ink-100 md:border-r', selected && 'max-md:hidden')}>
          <div className="space-y-2 border-b border-ink-100 bg-ink-50/50 p-3">
            <label className="relative block">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nome, telefone ou etiqueta" aria-label="Buscar conversa" className="field-input rounded-full bg-white pl-9" />
            </label>
            <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar conversas">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={cn('min-h-9 shrink-0 rounded-full px-3 text-[0.74rem] font-semibold', filter === value ? 'bg-brand text-white' : 'bg-white text-ink-600 hover:bg-ink-100')}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversas">
            {visible.length === 0 && <li className="p-6 text-center text-sm text-ink-500">{threads.length === 0 ? 'Nenhuma conversa recebida ainda. Quando um cliente mandar mensagem para o WhatsApp da loja, ela aparece aqui.' : 'Nenhuma conversa neste filtro.'}</li>}
            {visible.map((t) => (
              <li key={t.id}>
                <Link href={`/app/atendimento?conversa=${t.id}`} scroll={false} className={cn('flex gap-3 border-b border-ink-50 px-3 py-3 transition-colors hover:bg-ink-50', t.id === selectedId && 'bg-brand-light')}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/15 to-brand/30 text-[0.8rem] font-bold text-brand">{contactLabel(t).slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn('truncate text-[0.88rem] text-ink-900', t.unread ? 'font-extrabold' : 'font-semibold')}>{contactLabel(t)}</span>
                      <span className={cn('shrink-0 text-[0.68rem]', t.unread ? 'font-bold text-brand' : 'text-ink-400')}>{when(t.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn('min-w-0 flex-1 truncate text-[0.76rem]', t.unread ? 'font-semibold text-ink-800' : 'text-ink-500')}>{t.lastMessage ?? 'Sem mensagens'}</span>
                      {t.unread ? <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[0.66rem] font-bold text-white" data-testid="thread-unread" aria-label={`${t.unread} não lidas`}>{t.unread}</span>
                        : t.waiting ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Aguardando resposta" /> : null}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span className={cn('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', t.status === 'BOT' ? 'bg-sky-50 text-sky-700' : t.status === 'HUMAN' ? 'bg-amber-50 text-amber-700' : 'bg-ink-50 text-ink-500')}>{STATUS_LABEL[t.status]}</span>
                      {(t.tags ?? []).slice(0, 3).map((tag) => <span key={tag} className="rounded-full bg-ink-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-600">{tag}</span>)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat */}
        <section className={cn('flex min-h-0 flex-col', !selected && 'max-md:hidden')} aria-label="Conversa">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-ink-50/40 p-6 text-center text-sm text-ink-500"><Bot size={28} className="text-brand" aria-hidden />Escolha uma conversa para ver o histórico e responder.</div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
                <Link href="/app/atendimento" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50 md:hidden" aria-label="Voltar para a lista"><ArrowLeft size={18} aria-hidden /></Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{contactLabel(selected)}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[0.72rem] text-ink-500">+{selected.contact} · <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', selected.status === 'BOT' ? 'bg-brand-light text-brand' : selected.status === 'HUMAN' ? 'bg-warn-bg text-warn' : 'bg-ink-100 text-ink-600')} data-testid="thread-mode">{selected.status === 'BOT' ? 'IA respondendo' : selected.status === 'HUMAN' ? 'Atendente (IA pausada)' : 'Encerrada'}</span>{assignee && selected.status === 'HUMAN' && <span>· Responsável: <strong>{assignee.name}</strong></span>}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.status !== 'HUMAN' && <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus('HUMAN')}>Assumir atendimento</Button>}
                  {selected.status !== 'BOT' && <Button size="sm" variant="ghost" disabled={pending || !aiEnabled} onClick={() => setStatus('BOT')} title={aiEnabled ? undefined : 'Ative a IA na configuração do WhatsApp'}>Devolver para IA</Button>}
                  <Link href={`/app/pedidos?novoPedido=1&origem=whatsapp&telefone=${encodeURIComponent(selected.contact.replace(/^55/, ''))}&nome=${encodeURIComponent(selected.name ?? '')}`} className="inline-flex min-h-9 items-center rounded-lg bg-brand px-3 text-[0.8rem] font-semibold text-white hover:bg-brand-dark" data-testid="create-order-from-chat">Criar pedido</Link>
                  {selected.status !== 'CLOSED' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus('CLOSED')}>Encerrar</Button>}
                  <Button size="sm" variant="ghost" className="xl:hidden" onClick={() => setShowPanel((v) => !v)} aria-expanded={showPanel}><UserRound size={15} aria-hidden /> Cliente</Button>
                </div>
              </header>
              <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,#f4f8fb,#eef3f8)] p-3" aria-live="polite">
                {messages.length === 0 && <li className="p-6 text-center text-sm text-ink-500">Sem mensagens nesta conversa.</li>}
                {messages.map((m) => (
                  <li key={m.id} className={cn('flex', m.author === 'customer' ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-[0.85rem] shadow-sm', m.author === 'customer' ? 'rounded-tl-sm bg-white text-ink-800' : m.author === 'ai' ? 'rounded-tr-sm bg-sky-100 text-ink-900' : 'rounded-tr-sm bg-brand text-white')}>
                      <p className={cn('mb-0.5 flex items-center gap-1 text-[0.64rem] font-bold uppercase tracking-wide', m.author === 'agent' ? 'text-white/80' : 'text-ink-500')}>
                        {m.author === 'ai' ? <Bot size={11} aria-hidden /> : <User size={11} aria-hidden />}
                        {m.author === 'customer' ? 'Cliente' : m.author === 'ai' ? 'IA' : 'Atendente'}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={cn('mt-1 flex items-center justify-end gap-1 text-[0.64rem]', m.author === 'agent' ? 'text-white/75' : 'text-ink-400')}>{when(m.createdAt)}{m.author !== 'customer' && <><Tick status={m.status} />{['FAILED', 'UNCERTAIN', 'CANCELLED'].includes(m.status) ? <span className="font-bold">{DELIVERY[m.status]}</span> : null}</>}</p>
                    </div>
                  </li>
                ))}
                <div ref={end} />
              </ol>
              <form onSubmit={send} className="border-t border-ink-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {error && <p role="alert" className="mb-2 rounded-lg bg-danger-bg px-3 py-2 text-[0.78rem] text-danger">{error}</p>}
                {!windowOpen && <p className="mb-2 text-[0.74rem] text-ink-500">A janela de 24 horas do WhatsApp está fechada: responda quando o cliente enviar uma nova mensagem.</p>}
                <div className="flex items-end gap-2">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={windowOpen ? 'Escreva sua resposta…' : 'Aguardando nova mensagem do cliente'} disabled={!windowOpen} aria-label="Resposta" className="field-input min-h-11 flex-1 resize-none rounded-2xl" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }} />
                  <Button type="submit" className="min-h-11 rounded-full" loading={pending} disabled={!windowOpen || !text.trim()} aria-label="Enviar resposta"><Send size={16} aria-hidden /><span className="max-sm:sr-only">Enviar</span></Button>
                </div>
                <p className="mt-1 text-[0.68rem] text-ink-400">Enter envia · Shift+Enter quebra a linha. Ao responder, a conversa passa para atendimento humano e a IA pausa nela.</p>
              </form>
            </>
          )}
        </section>

        {/* Painel do cliente */}
        {selected && (
          <aside className={cn('min-h-0 overflow-y-auto border-ink-100 bg-ink-50/40 p-3 xl:block xl:border-l', showPanel ? 'max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-[60] max-xl:w-[min(92vw,340px)] max-xl:bg-white max-xl:shadow-2xl' : 'hidden')} data-testid="customer-panel" aria-label="Dados do cliente">
            <div className="mb-3 flex items-center justify-between xl:hidden"><p className="font-semibold">Cliente</p><button type="button" onClick={() => setShowPanel(false)} aria-label="Fechar painel do cliente" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-ink-100"><X size={18} /></button></div>
            <section className="rounded-xl bg-white p-3 shadow-sm">
              <p className="text-[0.95rem] font-bold text-ink-900">{customer?.name ?? contactLabel(selected)}</p>
              <p className="text-[0.76rem] text-ink-500">{formatPhone(customer?.phone ?? selected.contact)}{customer?.since ? ` · cliente desde ${new Date(customer.since).toLocaleDateString('pt-BR')}` : ' · ainda não cadastrado'}</p>
            </section>

            <section className="mt-3 rounded-xl bg-white p-3 shadow-sm" data-testid="customer-orders">
              <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">Últimos pedidos</h3>
              {!customer?.orders.length ? <p className="text-[0.78rem] text-ink-500">Nenhum pedido com este telefone.</p> : (
                <ul className="space-y-1.5">{customer.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-[0.78rem]"><span><strong>#{o.displayId}</strong> · {operationalLabel(o.status, 'DELIVERY')}<br /><span className="text-ink-400">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</span></span><span className="font-semibold">{formatBRL(o.total)}</span></li>
                ))}</ul>
              )}
            </section>

            {selected.status !== 'CLOSED' && team.length > 1 && (
              <section className="mt-3 rounded-xl bg-white p-3 shadow-sm" data-testid="thread-transfer">
                <h3 className="mb-2 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">Atribuição</h3>
                {assignee && <p className="mb-2 text-[0.78rem] text-ink-600">Responsável: <strong>{assignee.name}</strong></p>}
                <div className="flex gap-1.5">
                  <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} aria-label="Transferir para" className="field-input !min-h-9 min-w-0 flex-1 !py-1 text-[0.78rem]">
                    <option value="">Transferir para…</option>
                    {team.filter((m) => m.id !== assignee?.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <Button size="sm" variant="secondary" disabled={pending || !transferTo} onClick={() => act(() => transferAssistantThread({ threadId: selected.id, userId: transferTo }), () => setTransferTo(''))}>Transferir</Button>
                </div>
              </section>
            )}

            <section className="mt-3 rounded-xl bg-white p-3 shadow-sm" data-testid="thread-tags">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400"><Tag size={12} aria-hidden /> Etiquetas</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-light px-2 py-1 text-[0.72rem] font-semibold text-brand">{tag}<button type="button" aria-label={`Remover etiqueta ${tag}`} onClick={() => saveTags(tags.filter((t) => t !== tag))}><X size={12} /></button></span>)}
                {!tags.length && <span className="text-[0.76rem] text-ink-400">Sem etiquetas.</span>}
              </div>
              <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (tagDraft.trim()) saveTags([...tags, tagDraft.trim()]); }}>
                <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} maxLength={24} list="tag-suggestions" placeholder="Nova etiqueta" aria-label="Nova etiqueta" className="field-input !min-h-9 min-w-0 flex-1 !py-1 text-[0.78rem]" />
                <datalist id="tag-suggestions">{TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
                <Button size="sm" variant="secondary" type="submit" disabled={pending || !tagDraft.trim()} aria-label="Adicionar etiqueta"><Plus size={14} /></Button>
              </form>
            </section>

            <section className="mt-3 rounded-xl bg-white p-3 shadow-sm" data-testid="thread-notes">
              <h3 className="mb-2 flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400"><StickyNote size={12} aria-hidden /> Notas internas</h3>
              <p className="mb-2 text-[0.7rem] text-ink-400">Só a equipe vê. Nunca são enviadas ao cliente.</p>
              <ul className="space-y-1.5">{notes.map((n) => <li key={n.id} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[0.78rem] text-ink-800"><p className="whitespace-pre-wrap break-words">{n.text}</p><p className="mt-0.5 text-[0.66rem] text-ink-500">{n.by} · {when(n.at)}</p></li>)}</ul>
              <form className="mt-2 space-y-1.5" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act(() => addThreadNoteAction({ threadId: selected.id, text: note }), () => setNote('')); }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Ex.: cliente prefere entrega após 19h" aria-label="Nova nota interna" className="field-input text-[0.8rem]" />
                <Button size="sm" variant="secondary" type="submit" disabled={pending || note.trim().length < 2}>Adicionar nota</Button>
              </form>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
