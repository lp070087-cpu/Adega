'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Link2, MessageCircle } from 'lucide-react';
import { applicationLabels, type ApplicationStatus } from '@/lib/driver-applications-rules';
import { decideDriverApplicationAction } from '@/app/actions/driver-applications';

type Application = { id: string; status: string; createdAt: string; user: { name: string; email: string | null; emailVerified: string | null }; events: { actorId: string; status: string; reason: string; createdAt: string }[] };
const ACTIONS: Record<string, Array<{ status: ApplicationStatus; label: string; tone: 'primary' | 'danger' | 'neutral'; reason: string }>> = {
  PENDING: [{ status: 'APPROVED', label: 'Aprovar', tone: 'primary', reason: 'Aprovado pela loja.' }, { status: 'REJECTED', label: 'Recusar', tone: 'danger', reason: 'Recusado pela loja.' }],
  APPROVED: [{ status: 'SUSPENDED', label: 'Suspender', tone: 'neutral', reason: 'Suspenso pela loja.' }, { status: 'REVOKED', label: 'Revogar vínculo', tone: 'danger', reason: 'Vínculo revogado pela loja.' }],
  SUSPENDED: [{ status: 'APPROVED', label: 'Reativar', tone: 'primary', reason: 'Reativado pela loja.' }, { status: 'REVOKED', label: 'Revogar vínculo', tone: 'danger', reason: 'Vínculo revogado pela loja.' }],
  REJECTED: [{ status: 'PENDING', label: 'Reabrir solicitação', tone: 'neutral', reason: 'Solicitação reaberta pela loja.' }],
  REVOKED: [{ status: 'PENDING', label: 'Reabrir solicitação', tone: 'neutral', reason: 'Solicitação reaberta pela loja.' }],
};
const TONE = { primary: 'bg-brand text-white', danger: 'border border-danger/40 text-danger', neutral: 'border border-ink-200 text-ink-700' };

export function DriverApplicationsManager({ applications, approved, scales, enabled }: { applications: Application[]; approved: ReactNode; scales: ReactNode; enabled: boolean }) {
  const pendingCount = applications.filter((a) => a.status === 'PENDING').length;
  const [tab, setTab] = useState(pendingCount ? 'pending' : 'approved'), [error, setError] = useState(''), [busy, start] = useTransition();
  const router = useRouter();
  const tabs = enabled
    ? [['pending', `Solicitações${pendingCount ? ` (${pendingCount})` : ''}`], ['approved', 'Vinculados'], ['rejected', 'Recusados'], ['scales', 'Escalas']]
    : [['approved', 'Vinculados'], ['scales', 'Escalas']];
  const rows = applications.filter((a) => tab === 'pending' ? a.status === 'PENDING' : tab === 'rejected' ? ['REJECTED', 'REVOKED'].includes(a.status) : ['APPROVED', 'SUSPENDED'].includes(a.status));
  function decide(id: string, status: ApplicationStatus, fallback: string, form: HTMLFormElement) {
    const typed = String(new FormData(form).get('reason') ?? '').trim();
    start(async () => {
      const result = await decideDriverApplicationAction({ id, status, reason: typed.length >= 5 ? typed : fallback });
      if ('error' in result) setError(String(result.error)); else { setError(''); router.refresh(); }
    });
  }
  return (
    <section className="min-w-0 space-y-4">
      <div role="tablist" aria-label="Gestão dos entregadores" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([value, label]) => <button key={value} role="tab" aria-selected={value === tab} aria-controls={`drivers-${value}`} id={`drivers-tab-${value}`} onClick={() => setTab(value)} className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold ${tab === value ? 'bg-brand text-white' : 'bg-ink-100 text-ink-700'}`}>{label}</button>)}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div role="tabpanel" id={`drivers-${tab}`} aria-labelledby={`drivers-tab-${tab}`}>
        {tab === 'scales' ? scales : <>
          {tab === 'approved' && approved}
          {enabled && <div className="mt-3 space-y-3">
            {!rows.length && tab !== 'approved' && <p className="rounded-lg bg-white p-4 text-sm text-ink-500">{tab === 'pending' ? 'Nenhuma solicitação pendente. Compartilhe o link da área de entregadores para receber cadastros.' : 'Nenhum registro nesta seção.'}</p>}
            {tab === 'approved' && rows.length > 0 && <h3 className="pt-2 text-sm font-bold text-ink-800">Vínculos por solicitação</h3>}
            {rows.map((a) => (
              <article key={a.id} className="rounded-xl border border-ink-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-ink-900">{a.user.name}</h4>
                    <p className="break-all text-sm text-ink-600">{a.user.email}</p>
                    <p className="text-xs text-ink-500">{new Date(a.createdAt).toLocaleString('pt-BR')} · {a.user.emailVerified ? 'E-mail confirmado' : 'E-mail não confirmado'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${a.status === 'APPROVED' ? 'bg-success-bg text-success' : a.status === 'PENDING' ? 'bg-brand-light text-brand' : 'bg-ink-100 text-ink-600'}`}>{applicationLabels[a.status as ApplicationStatus]}</span>
                </div>
                <form className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-end" onSubmit={(e) => e.preventDefault()}>
                  <label className="min-w-0 text-xs text-ink-600 sm:flex-1">Observação (opcional)<input name="reason" maxLength={300} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-ink-200 p-2 text-sm" placeholder="Visível no histórico da solicitação" /></label>
                  <div className="flex flex-wrap gap-2">
                    {(ACTIONS[a.status] ?? []).map((action) => <button key={action.status} type="button" disabled={busy} onClick={(e) => decide(a.id, action.status, action.reason, e.currentTarget.form!)} className={`min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold sm:flex-none ${TONE[action.tone]}`}>{action.label}</button>)}
                  </div>
                </form>
                {a.events.length > 0 && <details className="mt-3 text-xs text-ink-500"><summary className="min-h-10 cursor-pointer">Histórico</summary>{a.events.map((event, i) => <p key={i} className="py-1">{new Date(event.createdAt).toLocaleString('pt-BR')} · {applicationLabels[event.status as ApplicationStatus]} · {event.reason}</p>)}</details>}
              </article>
            ))}
          </div>}
        </>}
      </div>
    </section>
  );
}

/** The single, permanent driver-area link of the store. */
export function DriverLinkCard({ url, enabled, pendingCount }: { url: string | null; enabled: boolean; pendingCount: number }) {
  const [message, setMessage] = useState('');
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><Link2 size={20} aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="font-bold text-ink-900">Link da área de entregadores</h3>
          <p className="text-sm text-ink-500">Um único link permanente da sua loja. O entregador abre, entra ou cria a conta e solicita o vínculo. Você aprova aqui.{enabled && pendingCount > 0 ? ` ${pendingCount} solicitação(ões) aguardando.` : ''}</p>
        </div>
      </div>
      {enabled && url ? <>
        <p className="mt-3 break-all rounded-lg bg-ink-50 p-3 font-mono text-[0.82rem] text-ink-800" data-testid="driver-link">{url}</p>
        <div className="mt-3 grid gap-2 sm:flex">
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage('Link copiado.'); } catch { setMessage('Selecione e copie o endereço acima.'); } }}><Copy size={16} aria-hidden />Copiar link</button>
          <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-200 px-4 text-sm font-semibold text-ink-800" href={`https://wa.me/?text=${encodeURIComponent(`Área de entregadores da nossa loja no Del Flash: ${url}`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden />Compartilhar pelo WhatsApp</a>
        </div>
        {message && <p role="status" className="mt-2 text-sm text-ink-600">{message}</p>}
      </> : <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O cadastro de entregadores pelo link será liberado assim que a plataforma concluir a atualização do banco de dados. Os entregadores já vinculados continuam funcionando normalmente.</p>}
    </section>
  );
}
