'use client';
import { driverAvailability, isDriverOnline, DRIVER_AVAILABILITY_LABEL } from '@/lib/driver-availability';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { SessionExpiredNotice } from '@/components/ui/SessionExpiredNotice';
import { useRouter } from 'next/navigation';
import { formatPhone } from '@/lib/utils';
import {
  createDriverAction,
  deactivateDriverAction,
  issueTemporaryCredentialAction,
  type TemporaryCredential,
  reactivateDriverAction,
  removeDriverLinkAction,
  updateDriverAction,
} from '@/app/actions/drivers';
import { DriverLinkCard } from './DriverLinkCard';
import { VEHICLE_TYPE_LABEL } from '@/data/business-copy';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ENTREGADORES
 * -----------------------------------------------------------------------
 * Cadastro da frota e o acesso ao app /entregador.
 *
 * Criar entregador com login cria também o OrganizationUser com papel
 * DRIVER — é esse vínculo que dá acesso ao app e a NADA mais. O
 * entregador não enxerga catálogo, financeiro nem clientes.
 *
 * Desativar não apaga: o histórico de entregas precisa continuar íntegro,
 * e o login é bloqueado na mesma transação. Excluir o cadastro reescreveria
 * o passado de quem já entregou.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type DriverRow = {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehiclePlate: string | null;
  status: string;
  active: boolean;
  hasLogin: boolean;
  accessPending?: boolean;
  canIssueTemp?: boolean;
  email: string | null;
  username: string | null;
  activeOrders: number;
  onShift?: boolean;
  shiftLabel?: string;
  deliveredTotal: number;
  deliveredToday: number;
};

export type DriverSummaryView = {
  total: number;
  active: number;
  online: number;
  busy: number;
  dispatchesToday: number;
};

const VEHICLE_OPTIONS = ['MOTORCYCLE', 'CAR', 'BICYCLE', 'ON_FOOT'] as const;
type Confirm = { driver: DriverRow; kind: 'suspend' | 'remove' };

export function DriversManager({
  drivers,
  summary,
  canManage,
  linkUrl,
  scheduleSlot,
}: {
  drivers: DriverRow[];
  summary: DriverSummaryView;
  canManage: boolean;
  linkUrl: string | null;
  scheduleSlot?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Sessão do painel perdida (ex.: saiu ou entrou como entregador em outra aba).
  const [sessionLost, setSessionLost] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // PIN exibido uma única vez, logo após gerar.
  const [credential, setCredential] = useState<TemporaryCredential | null>(null);
  // Trava síncrona contra toque duplo: o estado `pending` só chega no próximo render.
  const busy = useRef(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'suspended'>('all');
  const [tab, setTab] = useState<'team' | 'schedule' | 'access'>('team');

  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'MOTORCYCLE',
    vehiclePlate: '',
    active: true,
    createLogin: true,
    email: '',
  });


  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (filter === 'suspended' ? driver.active : !driver.active) return false;
      if (filter === 'online' && !isDriverOnline(driver)) return false;
      if (filter === 'offline' && isDriverOnline(driver)) return false;
      if (!term) return true;
      return (
        driver.name.toLowerCase().includes(term) ||
        driver.phone.includes(term.replace(/\D/g, '')) ||
        (driver.vehiclePlate ?? '').toLowerCase().includes(term)
      );
    });
  }, [drivers, search, filter]);

  function openCreate() {
    setError(null);
    setForm({
      name: '',
      phone: '',
      vehicleType: 'MOTORCYCLE',
      vehiclePlate: '',
      active: true,
      createLogin: true,
      email: '',
        });

    setCreating(true);
  }

  function openEdit(driver: DriverRow) {
    setError(null);
    setForm({
      name: driver.name,
      phone: driver.phone,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate ?? '',
      active: driver.active,
      createLogin: true,
      email: driver.email ?? '',
        });

    setEditing(driver);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setSessionLost(null);
  }

  // Rascunho guardado antes de "Entrar novamente"; volta aberto após o login.
  const DRAFT_KEY = 'delflash:entregadores:rascunho';
  function saveDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form, editingId: editing?.id ?? null })); } catch { /* armazenamento indisponível */ }
  }
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); sessionStorage.removeItem(DRAFT_KEY); } catch { return; }
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { form: typeof form; editingId: string | null };
      const target = draft.editingId ? drivers.find((driver) => driver.id === draft.editingId) : null;
      if (draft.editingId && !target) return;
      setForm(draft.form);
      if (target) setEditing(target); else setCreating(true);
      setNotice('Seus dados foram mantidos. Confira e salve novamente.');
    } catch { /* rascunho inválido: ignora */ }
    // Só na montagem: restaura uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFailure(result: { error?: string; code?: string }) {
    if (result.code === 'UNAUTHENTICATED') {
      setSessionLost(result.error ?? 'Sua sessão do painel foi encerrada. Entre novamente.');
      return;
    }
    setError(result.error ?? 'Não foi possível concluir.');
  }

  function buildForm(): FormData {
    const data = new FormData();
    data.set('name', form.name);
    data.set('phone', form.phone);
    data.set('vehicleType', form.vehicleType);
    data.set('vehiclePlate', form.vehiclePlate);
    data.set('active', form.active ? 'on' : 'off');
    data.set('email', form.email);
    if (form.createLogin) {
      data.set('createLogin', 'on');
      data.set('email', form.email);
    }
    return data;
  }

  function submit() {
    if (busy.current) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError('Informe o nome e o e-mail do entregador.');
      return;
    }
    busy.current = true;
    setError(null);
    setNotice(null);
    const data = buildForm();
    const wasEditing = editing;

    startTransition(async () => {
      try {
        const result = wasEditing
          ? await updateDriverAction(wasEditing.id, data)
          : await createDriverAction(data);
        if (!result.ok) { handleFailure(result); return; }
        closeForm();
        const issued = !wasEditing && 'data' in result ? (result.data as TemporaryCredential | undefined) : undefined;
        if (issued) setCredential(issued);
        setNotice(wasEditing ? `Cadastro de ${form.name.trim()} atualizado.` : issued ? `${form.name.trim()} foi adicionado.` : `${form.name.trim()} foi vinculado à loja. Ele já tem conta Del Flash e entra pelo link com a própria senha.`);
        router.refresh();
      } catch {
        setError('Sem conexão com o servidor. Confira a internet e tente de novo.');
      } finally {
        busy.current = false;
      }
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; code?: string }>, success: string, after?: () => void) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) { handleFailure(result); return; }
        after?.();
        setNotice(success);
        router.refresh();
      } catch {
        setError('Sem conexão com o servidor. Confira a internet e tente de novo.');
      } finally {
        busy.current = false;
      }
    });
  }

  function issueCredential(driver: DriverRow) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await issueTemporaryCredentialAction(driver.id);
        if (!result.ok) { handleFailure(result); return; }
        if (result.data) setCredential(result.data);
        router.refresh();
      } catch {
        setError('Sem conexão com o servidor. Confira a internet e tente de novo.');
      } finally {
        busy.current = false;
      }
    });
  }

  function confirmAction() {
    if (!confirm) return;
    const { driver, kind } = confirm;
    run(
      () => (kind === 'suspend' ? deactivateDriverAction(driver.id) : removeDriverLinkAction(driver.id)),
      kind === 'suspend' ? `${driver.name} foi suspenso nesta loja.` : `Vínculo de ${driver.name} removido. O histórico de entregas foi mantido.`,
      () => setConfirm(null),
    );
  }

  const formOpen = creating || editing !== null;

  const counts = {
    online: drivers.filter((d) => d.active && isDriverOnline(d)).length,
    offline: drivers.filter((d) => d.active && !isDriverOnline(d)).length,
    suspended: drivers.filter((d) => !d.active).length,
  };

  return (
    <div className="space-y-4">
      {sessionLost && !formOpen && !confirm && <SessionExpiredNotice message={sessionLost} back="/app/entregadores" />}
      {notice && !formOpen && !error && !sessionLost && <Alert tone="success">{notice}</Alert>}
      {error && !formOpen && !confirm && <Alert tone="danger" title="Não foi possível concluir">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="driver-summary">
        <Summary label="Online agora" value={String(summary.online)} tone="green" hint="Podem receber pedidos" />
        <Summary label="Em entrega" value={String(summary.busy)} tone="yellow" hint="Com pedido na rua" />
        <Summary label="Offline" value={String(Math.max(0, summary.active - summary.online))} hint={`${summary.active} ativos · ${summary.total} no total`} />
        <Summary label="Entregas hoje" value={String(summary.dispatchesToday)} hint="Concluídas" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-100 p-1" role="tablist" aria-label="Seções de entregadores">
          {([['team', 'Equipe'], ['schedule', 'Escala semanal'], ['access', 'Acesso ao app']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`min-h-11 rounded-md px-3 text-[0.78rem] font-bold transition-colors ${tab === key ? 'bg-white text-brand shadow-xs' : 'text-ink-600 hover:text-ink-900'}`}>{label}</button>
          ))}
        </div>
        {canManage && <Button onClick={openCreate}>+ Adicionar entregador</Button>}
      </div>

      {tab === 'access' && (
        <div className="space-y-3">
          {canManage && <DriverLinkCard url={linkUrl} />}
          <Card>
            <CardHeader title="Primeiro acesso" subtitle="Como o entregador entra no aplicativo" />
            <ol className="list-decimal space-y-1.5 pl-5 text-[0.82rem] text-ink-600">
              <li>Adicione o entregador com nome e e-mail: o sistema mostra uma senha temporária de 4 dígitos (uma única vez).</li>
              <li>Envie o link dos entregadores e passe a senha temporária pessoalmente.</li>
              <li>No primeiro acesso ele entra com e-mail e senha temporária e cria a própria senha.</li>
              <li>Esqueceu a senha? Use “Nova senha temporária” no cartão dele, na aba Equipe.</li>
            </ol>
          </Card>
        </div>
      )}

      {tab === 'schedule' && scheduleSlot}

      {tab === 'team' && (
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar entregadores">
            {([['all', `Todos (${drivers.length - counts.suspended})`], ['online', `Online (${counts.online})`], ['offline', `Offline (${counts.offline})`], ['suspended', `Suspensos (${counts.suspended})`]] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`min-h-9 rounded-full border px-3 text-[0.76rem] font-semibold ${filter === key ? 'border-brand bg-brand text-white' : 'border-ink-200 bg-white text-ink-700 hover:border-brand'}`}>{label}</button>
            ))}
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou placa…" className="w-full sm:ml-auto sm:max-w-xs" aria-label="Buscar entregador" />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="🛵"
            title={drivers.length === 0 ? 'Nenhum entregador cadastrado' : 'Nada encontrado'}
            description={drivers.length === 0 ? 'Adicione o primeiro entregador com nome e e-mail e envie a ele o link dos entregadores.' : 'Ajuste a busca ou o filtro.'}
            action={canManage && drivers.length === 0 ? <Button onClick={openCreate}>Adicionar entregador</Button> : undefined}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="driver-cards">
            {visible.map((driver) => (
              <li key={driver.id} data-testid="driver-card" className={`flex min-w-0 flex-col rounded-lg border border-ink-100 p-3.5 ${driver.active ? 'bg-white' : 'bg-ink-50 opacity-75'}`}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-light text-[0.8rem] font-extrabold text-brand" aria-hidden>{driver.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                  {/* Nome com largura mínima: um selo longo desce para a linha de baixo em vez de espremer o nome. */}
                  <div className="min-w-[9rem] flex-1">
                    <p className="break-words text-[0.9rem] font-semibold text-ink-900">{driver.name}</p>
                    <p className="text-[0.74rem] text-ink-500">{[driver.phone && formatPhone(driver.phone), VEHICLE_TYPE_LABEL[driver.vehicleType] ?? driver.vehicleType, driver.vehiclePlate].filter(Boolean).join(' · ')}</p>
                  </div>
                  <DriverAvailabilityBadge driver={driver} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-ink-50 px-2 py-2 text-center">
                  <div><dt className="text-[0.66rem] text-ink-500">Na rua</dt><dd className="text-[0.9rem] font-extrabold text-ink-900">{driver.activeOrders}</dd></div>
                  <div><dt className="text-[0.66rem] text-ink-500">Hoje</dt><dd className="text-[0.9rem] font-extrabold text-ink-900">{driver.deliveredToday}</dd></div>
                  <div><dt className="text-[0.66rem] text-ink-500">Total</dt><dd className="text-[0.9rem] font-extrabold text-ink-900">{driver.deliveredTotal}</dd></div>
                </dl>
                <div className="mt-2.5 space-y-1 text-[0.74rem] text-ink-600">
                  <AccessInfo driver={driver} />
                  {driver.shiftLabel && <p className="text-ink-500">Escala: {driver.shiftLabel.toLowerCase()}</p>}
                </div>
                {canManage && <div className="mt-3 border-t border-ink-100 pt-3"><RowActions driver={driver} onEdit={openEdit} onConfirm={(kind) => { setError(null); setConfirm({ driver, kind }); }} onReactivate={() => run(() => reactivateDriverAction(driver.id), `${driver.name} foi reativado nesta loja.`)} onIssue={() => issueCredential(driver)} pending={pending} wide /></div>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[0.72rem] text-ink-400">Online e offline vêm do aplicativo do entregador. A escala é só organizacional: não impede receber pedidos.</p>
      </Card>
      )}

      {/* ── Criar / editar ─────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Editar entregador' : 'Adicionar entregador'}
        subtitle={
          editing
            ? 'A senha é sempre do entregador: a loja não vê nem altera.'
            : 'Informe nome e e-mail. O sistema gera uma senha temporária de 4 dígitos para o primeiro acesso; o entregador cria a senha definitiva ao entrar.'
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={pending}>
              Cancelar
            </Button>
            <Button loading={pending} disabled={Boolean(sessionLost)} onClick={submit}>
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </>
        }
      >
        {sessionLost && <div className="mb-3.5"><SessionExpiredNotice message={sessionLost} back="/app/entregadores" onBeforeLogin={saveDraft} /></div>}
        {notice && !sessionLost && <Alert tone="info" className="mb-3.5">{notice}</Alert>}
        {error && !sessionLost && (
          <Alert tone="danger" className="mb-3.5">
            {error}
          </Alert>
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Nome" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              maxLength={120}
            />
          </Field>

          <Field label="Telefone (opcional)">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              placeholder="(11) 98888-0001"
            />
          </Field>

          <Field label="Veículo (opcional)">
            <Select
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              {VEHICLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {VEHICLE_TYPE_LABEL[option]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Placa" hint="Opcional. Só para identificar na rua.">
            <Input
              value={form.vehiclePlate}
              onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
              maxLength={10}
              className="uppercase"
            />
          </Field>
        </div>

        <Field label="E-mail do entregador" required hint={editing ? 'Ao trocar o e-mail, gere uma nova senha temporária para o entregador entrar com o novo endereço.' : 'É com este e-mail que ele entra. Se ele já trabalha em outra loja Del Flash, use o mesmo e-mail.'}>
          <Input type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} required maxLength={254} autoComplete="off" />
        </Field>
        <section className="mb-1 rounded-lg bg-ink-50 p-3"><h3 className="text-sm font-semibold">Horários de trabalho</h3><p className="mt-1 text-sm text-ink-500">Depois de salvar, configure dias e turnos na seção de horários desta página.</p></section>
      </Modal>

      {/* ── Senha temporária (exibida uma vez) ─────────────────────── */}
      <Modal
        open={credential !== null}
        onClose={() => setCredential(null)}
        title="Senha temporária de primeiro acesso"
        size="sm"
        footer={<Button onClick={() => setCredential(null)}>Concluído</Button>}
      >
        {credential && <TemporaryCredentialCard credential={credential} linkUrl={linkUrl} />}
      </Modal>

      {/* ── Suspender / remover vínculo ───────────────────────────── */}
      <Modal
        open={confirm !== null}
        onClose={() => { setConfirm(null); setSessionLost(null); }}
        title={confirm?.kind === 'remove' ? 'Remover vínculo com a loja' : 'Suspender entregador'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" loading={pending} disabled={Boolean(sessionLost)} onClick={confirmAction}>
              {confirm?.kind === 'remove' ? 'Remover vínculo' : 'Suspender'}
            </Button>
          </>
        }
      >
        {sessionLost && <div className="mb-3.5"><SessionExpiredNotice message={sessionLost} back="/app/entregadores" /></div>}
        {error && !sessionLost && (
          <Alert tone="danger" className="mb-3.5">
            {error}
          </Alert>
        )}
        <p className="text-[0.86rem] leading-relaxed text-ink-600">
          {confirm?.kind === 'remove' ? (
            <><strong className="text-ink-900">{confirm.driver.name}</strong> deixa de acessar o aplicativo por esta loja. As entregas feitas continuam no histórico, e a conta dele segue funcionando em outras lojas. Para trazê-lo de volta, adicione o e-mail novamente.</>
          ) : (
            <><strong className="text-ink-900">{confirm?.driver.name}</strong> sai da lista de despacho e o acesso ao aplicativo por esta loja fica bloqueado até você reativar. O histórico de entregas continua intacto.</>
          )}
        </p>
      </Modal>
    </div>
  );
}

function Summary({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'green' | 'yellow' }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[0.72rem] font-medium text-ink-500">{tone && <span className={`h-2 w-2 rounded-full ${tone === 'green' ? 'bg-success' : 'bg-warn'}`} aria-hidden />}{label}</p>
      <p className="mt-1 text-[1.2rem] font-extrabold leading-none text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[0.7rem] text-ink-400">{hint}</p>}
    </div>
  );
}

function TemporaryCredentialCard({ credential, linkUrl }: { credential: TemporaryCredential; linkUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const expires = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Recife' }).format(new Date(credential.expires));
  const share = `Seu acesso ao aplicativo de entregas: ${linkUrl ?? ''}\nE-mail: ${credential.email}\nA senha temporária eu te passo pessoalmente.`;
  return (
    <div className="space-y-3 text-[0.86rem] text-ink-600" data-testid="temp-credential">
      <p>Passe ao entregador <strong className="text-ink-900">{credential.driverName}</strong>. Ela só serve para o primeiro acesso e depois ele cria a própria senha.</p>
      <div className="rounded-lg border border-brand/30 bg-brand-light p-4 text-center">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-ink-500">Senha temporária</p>
        <p className="mt-1 font-mono text-[2rem] font-extrabold tracking-[0.35em] text-ink-900" data-testid="temp-pin">{credential.pin}</p>
        <p className="mt-1 text-[0.74rem] text-ink-500">E-mail: {credential.email} · válida até {expires} · uso único</p>
      </div>
      <p className="text-[0.76rem]">Por segurança, esta senha não aparece de novo. Se perder, gere uma nova. Após 5 tentativas erradas ela é cancelada.</p>
      <div className="grid gap-2 min-[400px]:grid-cols-2">
        <button type="button" className="min-h-11 rounded-sm border border-ink-200 px-3 font-semibold text-ink-800" onClick={async () => { try { await navigator.clipboard.writeText(credential.pin); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copiada' : 'Copiar senha'}</button>
        {linkUrl && <a className="inline-flex min-h-11 items-center justify-center rounded-sm border border-ink-200 px-3 font-semibold text-ink-800" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer">Enviar link pelo WhatsApp</a>}
      </div>
      <p className="text-[0.72rem] text-ink-500">O WhatsApp leva só o link e o e-mail. A senha não vai na mensagem automática.</p>
    </div>
  );
}

function AccessInfo({ driver }: { driver: DriverRow }) {
  return (
    <span className="block min-w-0 break-words text-[0.74rem] text-ink-500">{driver.hasLogin && 'Acesso: '}
      {driver.hasLogin ? (driver.email ?? (driver.username ? `@${driver.username}` : 'Com acesso')) : <Badge tone="neutral">Sem acesso ao aplicativo</Badge>}
      {driver.hasLogin && driver.accessPending && <span className="mt-1 block font-semibold text-amber-700">Aguardando primeiro acesso</span>}
      {!driver.active && <span className="mt-1 block text-[0.68rem] font-semibold text-danger">Suspenso</span>}
    </span>
  );
}

function RowActions({ driver, onEdit, onConfirm, onReactivate, onIssue, pending, wide }: { driver: DriverRow; onEdit: (driver: DriverRow) => void; onConfirm: (kind: 'suspend' | 'remove') => void; onReactivate: () => void; onIssue: () => void; pending: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'flex flex-wrap gap-2' : 'flex flex-wrap justify-end gap-1.5'}>
      <Button size="sm" variant="secondary" onClick={() => onEdit(driver)}>Editar</Button>
      {driver.active ? (
        <Button size="sm" variant="ghost" onClick={() => onConfirm('suspend')}>Suspender</Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={onReactivate}>Reativar</Button>
      )}
      {driver.active && driver.canIssueTemp && <Button size="sm" variant="ghost" disabled={pending} onClick={onIssue}>Nova senha temporária</Button>}
      {driver.hasLogin && <Button size="sm" variant="ghost" onClick={() => onConfirm('remove')}>Remover vínculo</Button>}
    </div>
  );
}

function DriverAvailabilityBadge({ driver }: { driver: DriverRow }) {
  const state = driverAvailability(driver);
  const tone = state === 'AVAILABLE' ? 'green' : state === 'BUSY' ? 'yellow' : state === 'INACTIVE' ? 'red' : 'neutral';
  return <Badge tone={tone}>{DRIVER_AVAILABILITY_LABEL[state]}</Badge>;
}
