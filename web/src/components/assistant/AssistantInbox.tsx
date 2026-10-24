'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Search, Send, User } from 'lucide-react';
import { sendHumanReplyAction, updateAssistantThread } from '@/app/actions/assistant';
import { Alert, Button } from '@/components/ui';
import { cn, formatPhone } from '@/lib/utils';

export type InboxThread = { id: string; contact: string; name: string | null; status: 'BOT' | 'HUMAN' | 'CLOSED'; lastMessage: string | null; lastAt: string; waiting: boolean };
export type InboxMessage = { id: string; author: 'customer' | 'ai' | 'agent'; body: string; status: string; createdAt: string };

const FILTERS = [
  ['all', 'Todas'],
  ['waiting', 'Aguardando'],
  ['BOT', 'IA'],
  ['HUMAN', 'Humano'],
  ['CLOSED', 'Encerradas'],
] as const;
type Filter = (typeof FILTERS)[number][0];
const STATUS_LABEL: Record<InboxThread['status'], string> = { BOT: 'IA', HUMAN: 'Humano', CLOSED: 'Encerrada' };
const DELIVERY: Record<string, string> = { SENDING: 'Enviando', SENT: 'Enviada', DELIVERED: 'Entregue', READ: 'Lida', FAILED: 'Falhou', UNCERTAIN: 'Envio incerto', QUEUED: 'Na fila', CANCELLED: 'Cancelada', RETRYABLE: 'Nova tentativa' };

const contactLabel = (thread: InboxThread) => thread.name ?? formatPhone(thread.contact.startsWith('55') ? thread.contact.slice(2) : thread.contact);
function when(iso: string) {
  const date = new Date(iso), now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat('pt-BR', sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit' }).format(date);
}

/** Caixa de entrada: lista à esquerda, conversa à direita (no celular, uma de cada vez). */
export function AssistantInbox({ threads, selectedId, messages, aiEnabled, webhookVerified }: { threads: InboxThread[]; selectedId: string | null; messages: InboxMessage[]; aiEnabled: boolean; webhookVerified: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const selected = threads.find((t) => t.id === selectedId) ?? null;

  // Atualiza a cada 15 s com a aba visível (novas mensagens chegam pelo webhook).
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 15000);
    return () => window.clearInterval(id);
  }, [router]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length, selectedId]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return threads.filter((t) => {
      if (filter === 'waiting' ? !t.waiting : filter !== 'all' && t.status !== filter) return false;
      if (!term) return true;
      return (t.name ?? '').toLowerCase().includes(term) || (digits.length > 0 && t.contact.includes(digits));
    });
  }, [threads, query, filter]);

  function setStatus(status: InboxThread['status']) {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await updateAssistantThread({ threadId: selected.id, status });
      if (!result.ok) setError('error' in result ? result.error ?? 'Não foi possível alterar.' : 'Não foi possível alterar.');
      router.refresh();
    });
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim() || pending) return;
    setError(null);
    const body = text;
    startTransition(async () => {
      const result = await sendHumanReplyAction({ threadId: selected.id, text: body });
      if (!result.ok) { setError(result.error); return; }
      setText('');
      router.refresh();
    });
  }

  const lastCustomer = [...messages].reverse().find((m) => m.author === 'customer');
  const windowOpen = Boolean(lastCustomer && Date.now() - new Date(lastCustomer.createdAt).getTime() < 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-3" data-testid="inbox">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Atendimento</h2>
        <p className="text-[0.76rem] text-ink-500">IA {aiEnabled ? 'ativa' : 'desativada'} · <Link href="/app/configuracoes/whatsapp" className="font-semibold text-brand">Configurar WhatsApp e IA</Link></p>
      </div>
      {!webhookVerified && <Alert tone="warn">Número conectado, mas o WhatsApp ainda não entregou nenhuma mensagem a esta loja. Confira o webhook na configuração do WhatsApp.</Alert>}

      <div className="grid min-h-[70dvh] overflow-hidden rounded-xl border border-ink-200 bg-white md:grid-cols-[320px_1fr]">
        {/* Lista */}
        <aside className={cn('flex min-h-0 flex-col border-ink-100 md:border-r', selected && 'max-md:hidden')}>
          <div className="space-y-2 border-b border-ink-100 p-3">
            <label className="relative block">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar conversa" className="field-input pl-9" />
            </label>
            <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar conversas">
              {FILTERS.map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={cn('min-h-9 shrink-0 rounded-full px-3 text-[0.74rem] font-semibold', filter === value ? 'bg-brand text-white' : 'bg-ink-50 text-ink-600')}>{label}</button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversas">
            {visible.length === 0 && <li className="p-6 text-center text-sm text-ink-500">{threads.length === 0 ? 'Nenhuma conversa recebida ainda. Quando um cliente mandar mensagem para o WhatsApp da loja, ela aparece aqui.' : 'Nenhuma conversa neste filtro.'}</li>}
            {visible.map((t) => (
              <li key={t.id}>
                <Link href={`/app/atendimento?conversa=${t.id}`} scroll={false} className={cn('flex gap-3 border-b border-ink-50 px-3 py-3 hover:bg-ink-50', t.id === selectedId && 'bg-brand-light')}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.78rem] font-bold text-ink-600">{contactLabel(t).slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.86rem] font-semibold text-ink-900">{contactLabel(t)}</span>
                      <span className="shrink-0 text-[0.68rem] text-ink-400">{when(t.lastAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[0.76rem] text-ink-500">{t.lastMessage ?? 'Sem mensagens'}</span>
                      {t.waiting && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Aguardando resposta" />}
                    </span>
                    <span className="mt-1 inline-block rounded-full bg-ink-50 px-2 py-0.5 text-[0.64rem] font-bold text-ink-500">{STATUS_LABEL[t.status]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        {/* Conversa */}
        <section className={cn('flex min-h-0 flex-col', !selected && 'max-md:hidden')} aria-label="Conversa">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-500">Escolha uma conversa para ver o histórico e responder.</div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
                <Link href="/app/atendimento" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-ink-50 md:hidden" aria-label="Voltar para a lista"><ArrowLeft size={18} aria-hidden /></Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{contactLabel(selected)}</p>
                  <p className="text-[0.72rem] text-ink-500">+{selected.contact} · {selected.status === 'BOT' ? 'Atendimento automático (IA)' : selected.status === 'HUMAN' ? 'Atendimento humano' : 'Encerrada'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.status !== 'HUMAN' && <Button size="sm" variant="secondary" disabled={pending} onClick={() => setStatus('HUMAN')}>Assumir atendimento</Button>}
                  {selected.status !== 'BOT' && <Button size="sm" variant="ghost" disabled={pending || !aiEnabled} onClick={() => setStatus('BOT')} title={aiEnabled ? undefined : 'Ative a IA na configuração do WhatsApp'}>Devolver para IA</Button>}
                  {selected.status !== 'CLOSED' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setStatus('CLOSED')}>Encerrar</Button>}
                </div>
              </header>
              <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-ink-50/60 p-3" aria-live="polite">
                {messages.length === 0 && <li className="p-6 text-center text-sm text-ink-500">Sem mensagens nesta conversa.</li>}
                {messages.map((m) => (
                  <li key={m.id} className={cn('flex', m.author === 'customer' ? 'justify-start' : 'justify-end')}>
                    <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[0.84rem] shadow-sm', m.author === 'customer' ? 'bg-white text-ink-800' : m.author === 'ai' ? 'bg-sky-100 text-ink-900' : 'bg-brand text-white')}>
                      <p className={cn('mb-0.5 flex items-center gap-1 text-[0.66rem] font-bold uppercase tracking-wide', m.author === 'agent' ? 'text-white/80' : 'text-ink-500')}>
                        {m.author === 'customer' ? <User size={11} aria-hidden /> : m.author === 'ai' ? <Bot size={11} aria-hidden /> : <User size={11} aria-hidden />}
                        {m.author === 'customer' ? 'Cliente' : m.author === 'ai' ? 'IA' : 'Atendente'}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={cn('mt-1 text-right text-[0.64rem]', m.author === 'agent' ? 'text-white/70' : 'text-ink-400')}>{when(m.createdAt)}{m.author !== 'customer' && DELIVERY[m.status] ? ` · ${DELIVERY[m.status]}` : ''}</p>
                    </div>
                  </li>
                ))}
                <div ref={end} />
              </ol>
              <form onSubmit={send} className="border-t border-ink-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {error && <p role="alert" className="mb-2 rounded-lg bg-danger-bg px-3 py-2 text-[0.78rem] text-danger">{error}</p>}
                {!windowOpen && <p className="mb-2 text-[0.74rem] text-ink-500">A janela de 24 horas do WhatsApp está fechada: responda quando o cliente enviar uma nova mensagem.</p>}
                <div className="flex items-end gap-2">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={windowOpen ? 'Escreva sua resposta…' : 'Aguardando nova mensagem do cliente'} disabled={!windowOpen} aria-label="Resposta" className="field-input min-h-11 flex-1 resize-none" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }} />
                  <Button type="submit" className="min-h-11" loading={pending} disabled={!windowOpen || !text.trim()} aria-label="Enviar resposta"><Send size={16} aria-hidden /><span className="max-sm:sr-only">Enviar</span></Button>
                </div>
                <p className="mt-1 text-[0.68rem] text-ink-400">Ao responder, a conversa passa para atendimento humano e a IA deixa de responder nela.</p>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
