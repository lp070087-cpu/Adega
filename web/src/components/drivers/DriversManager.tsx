'use client';
import { driverAvailability, DRIVER_AVAILABILITY_LABEL } from '@/lib/driver-availability';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { SessionExpiredNotice } from '@/components/ui/SessionExpiredNotice';
import { useRouter } from 'next/navigation';
import { formatPhone, timeAgo } from '@/lib/utils';
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
  lastLocation: { latitude: number; longitude: number; createdAt: string } | null;
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
}: {
  drivers: DriverRow[];
  summary: DriverSummaryView;
  canManage: boolean;
  linkUrl: string | null;
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
  const [showInactive, setShowInactive] = useState(false);

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
      if (!showInactive && !driver.active) return false;
      if (!term) return true;
      return (
        driver.name.toLowerCase().includes(term) ||
        driver.phone.includes(term.replace(/\D/g, '')) ||
        (driver.vehiclePlate ?? '').toLowerCase().includes(term)
      );
    });
  }, [drivers, search, showInactive]);

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

  return (
    <div className="space-y-4">
      {canManage && <DriverLinkCard url={linkUrl} onAdd={openCreate} />}
      {sessionLost && !formOpen && !confirm && <SessionExpiredNotice message={sessionLost} back="/app/entregadores" />}
      {notice && !formOpen && !error && !sessionLost && (
        <Alert tone="success">{notice}</Alert>
      )}
      {error && !formOpen && !confirm && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Entregadores" value={String(summary.active)} hint={`${summary.total} no total`} />
        <Summary label="Disponíveis agora" value={String(summary.online)} hint="Prontos para receber pedido" />
        <Summary label="Em entrega" value={String(summary.busy)} hint="Com pedido na rua" />
        <Summary label="Entregas hoje" value={String(summary.dispatchesToday)} hint="Concluídas" />
      </div>

      <Card>
        <CardHeader
          title="Frota"
          subtitle="Disponibilidade calculada automaticamente pela escala e pelas entregas em andamento."
        />

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou placa…"
            className="max-w-xs"
            aria-label="Buscar entregador"
          />
          <label className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-ink-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
            />
            Mostrar suspensos
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="🛵"
            title={drivers.length === 0 ? 'Nenhum entregador cadastrado' : 'Nada encontrado'}
            description={
              drivers.length === 0
                ? 'Adicione o primeiro entregador com nome e e-mail e envie a ele o link dos entregadores.'
                : 'Ajuste a busca ou marque “Mostrar suspensos”.'
            }
            action={
              canManage && drivers.length === 0 ? (
                <Button onClick={openCreate}>Adicionar entregador</Button>
              ) : undefined
            }
          />
        ) : (
          <>
          <ul className="grid gap-3 md:hidden" data-testid="driver-cards">
            {visible.map((driver) => (
              <li key={driver.id} className={`rounded-lg border border-ink-100 p-3 ${driver.active ? '' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-[0.9rem] font-semibold text-ink-900">{driver.name}</p>
                    <p className="text-[0.74rem] text-ink-500">{[driver.phone && formatPhone(driver.phone), VEHICLE_TYPE_LABEL[driver.vehicleType] ?? driver.vehicleType, driver.vehiclePlate].filter(Boolean).join(' · ')}</p>
                  </div>
                  <DriverAvailabilityBadge driver={driver} />
                </div>
                <div className="mt-2 text-[0.76rem] text-ink-600"><AccessInfo driver={driver} /></div>
                <p className="mt-1 text-[0.72rem] text-ink-500">{driver.shiftLabel}{driver.activeOrders ? ` · ${driver.activeOrders} na rua` : ''} · {driver.deliveredToday} hoje · {driver.deliveredTotal} no total</p>
                {canManage && <div className="mt-3"><RowActions driver={driver} onEdit={openEdit} onConfirm={(kind) => { setError(null); setConfirm({ driver, kind }); }} onReactivate={() => run(() => reactivateDriverAction(driver.id), `${driver.name} foi reativado nesta loja.`)} onIssue={() => issueCredential(driver)} pending={pending} wide /></div>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-ink-100 text-left">
                  <Th>Entregador</Th>
                  <Th>Veículo</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Na rua</Th>
                  <Th className="text-right">Hoje</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Acesso</Th>
                  {canManage && <Th className="text-right">Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((driver) => (
                  <tr
                    key={driver.id}
                    className={`border-b border-ink-100 last:border-b-0 ${
                      driver.active ? '' : 'opacity-60'
                    }`}
                  >
                    <td className="py-2.5 pr-4">
                      <p className="text-[0.84rem] font-semibold text-ink-800">{driver.name}</p>
                      <p className="text-[0.7rem] text-ink-400">{formatPhone(driver.phone)}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <p className="text-[0.8rem] text-ink-600">
                        {VEHICLE_TYPE_LABEL[driver.vehicleType] ?? driver.vehicleType}
                      </p>
                      {driver.vehiclePlate && (
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-400">
                          {driver.vehiclePlate}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <DriverAvailabilityBadge driver={driver} />
                      {driver.lastLocation && (
                        <p className="mt-1 text-[0.68rem] text-ink-400">
                          GPS {timeAgo(driver.lastLocation.createdAt)}
                        </p>
                      )}
                      <p className="mt-1 text-[0.7rem] text-ink-500">{driver.shiftLabel}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {driver.activeOrders > 0 ? (
                        <Badge tone="orange">{driver.activeOrders}</Badge>
                      ) : (
                        <span className="text-[0.8rem] text-ink-400">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.82rem] font-bold text-ink-900">
                      {driver.deliveredToday}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                      {driver.deliveredTotal}
                    </td>
                    <td className="py-2.5 pr-4">
                      <AccessInfo driver={driver} />
                    </td>
                    {canManage && (
                      <td className="py-2.5 text-right">
                        <RowActions driver={driver} onEdit={openEdit} onConfirm={(kind) => { setError(null); setConfirm({ driver, kind }); }} onReactivate={() => run(() => reactivateDriverAction(driver.id), `${driver.name} foi reativado nesta loja.`)} onIssue={() => issueCredential(driver)} pending={pending} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

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

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white px-4 py-3.5">
      <p className="text-[0.72rem] font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-[1.2rem] font-extrabold leading-none text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-[0.7rem] text-ink-400">{hint}</p>}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500 ${
        className ?? ''
      }`}
    >
      {children}
    </th>
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
    <span className="block min-w-0 break-words text-[0.74rem] text-ink-500">
      {driver.hasLogin ? (driver.email ?? (driver.username ? `@${driver.username}` : 'Com acesso')) : <Badge tone="neutral">Sem acesso ao aplicativo</Badge>}
      {driver.hasLogin && driver.accessPending && <span className="mt-1 block font-semibold text-amber-700">Aguardando primeiro acesso</span>}
      {!driver.active && <span className="mt-1 block text-[0.68rem] font-semibold text-danger">Suspenso</span>}
    </span>
  );
}

function RowActions({ driver, onEdit, onConfirm, onReactivate, onIssue, pending, wide }: { driver: DriverRow; onEdit: (driver: DriverRow) => void; onConfirm: (kind: 'suspend' | 'remove') => void; onReactivate: () => void; onIssue: () => void; pending: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'grid grid-cols-2 gap-2 min-[400px]:flex min-[400px]:flex-wrap' : 'flex flex-wrap justify-end gap-1.5'}>
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
  const tone = state === 'AVAILABLE' ? 'green' : state === 'BUSY' ? 'yellow' : 'neutral';
  return <Badge tone={tone}>{DRIVER_AVAILABILITY_LABEL[state]}</Badge>;
}
