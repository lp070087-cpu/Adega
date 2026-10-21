'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatPhone, timeAgo } from '@/lib/utils';
import {
  createDriverAction,
  deactivateDriverAction,
  setDriverStatusAction,
  updateDriverAction,
} from '@/app/actions/drivers';
import { DRIVER_STATUS_LABEL, VEHICLE_TYPE_LABEL } from '@/data/business-copy';
import { DriverStatusBadge } from '@/components/ui/StatusBadge';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
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
const STATUS_OPTIONS = ['OFFLINE', 'ONLINE', 'BUSY', 'RETURNING'] as const;

export function DriversManager({
  drivers,
  summary,
  canManage,
}: {
  drivers: DriverRow[];
  summary: DriverSummaryView;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<DriverRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<DriverRow | null>(null);

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
    setError(null);
    const data = buildForm();

    startTransition(async () => {
      const result = editing
        ? await updateDriverAction(editing.id, data)
        : await createDriverAction(data);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeForm();
      router.refresh();
    });
  }

  function changeStatus(driver: DriverRow, status: (typeof STATUS_OPTIONS)[number]) {
    setError(null);
    startTransition(async () => {
      const result = await setDriverStatusAction({ driverId: driver.id, status });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function deactivate() {
    if (!confirmDeactivate) return;
    const target = confirmDeactivate;
    setError(null);

    startTransition(async () => {
      const result = await deactivateDriverAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmDeactivate(null);
      router.refresh();
    });
  }

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-4">
      {error && !formOpen && !confirmDeactivate && (
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
          subtitle="Status muda pelo app do entregador ou aqui, manualmente."
          action={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                + Novo entregador
              </Button>
            ) : undefined
          }
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
            Mostrar desativados
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="🛵"
            title={drivers.length === 0 ? 'Nenhum entregador cadastrado' : 'Nada encontrado'}
            description={
              drivers.length === 0
                ? 'Cadastre o primeiro entregador para começar a despachar pedidos. Dá para criar o acesso dele ao app no mesmo formulário.'
                : 'Ajuste a busca ou marque “Mostrar desativados”.'
            }
            action={
              canManage && drivers.length === 0 ? (
                <Button onClick={openCreate}>Cadastrar entregador</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
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
                      {canManage && driver.active && driver.activeOrders === 0 ? (
                        <select
                          value={driver.status}
                          onChange={(e) =>
                            changeStatus(driver, e.target.value as (typeof STATUS_OPTIONS)[number])
                          }
                          disabled={pending}
                          className="field-input max-w-[150px] cursor-pointer py-1.5 text-[0.76rem]"
                          aria-label={`Status de ${driver.name}`}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status} disabled={status === 'BUSY' || (status === 'ONLINE' && driver.onShift === false)}>
                              {DRIVER_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <DriverStatusBadge status={driver.status} />
                      )}
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
                      {driver.hasLogin ? (
                        <span className="text-[0.74rem] text-ink-500">
                          {driver.email ?? (driver.username ? `@${driver.username}`:'Com login')}
                          {driver.accessPending&&<span className="mt-1 block font-semibold text-amber-700">Ativação pendente</span>}
                        </span>
                      ) : (
                        <Badge tone="neutral">Sem login</Badge>
                      )}
                      {!driver.active && (
                        <span className="mt-1 block text-[0.68rem] font-semibold text-danger">
                          Desativado
                        </span>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => openEdit(driver)}>
                            Editar
                          </Button>
                          {driver.active && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setError(null);
                                setConfirmDeactivate(driver);
                              }}
                            >
                              Desativar
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Criar / editar ─────────────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Editar entregador' : 'Novo entregador'}
        subtitle={
          editing
            ? 'Edição não altera login nem senha — isso é fluxo separado.'
            : 'O acesso ao app do entregador é opcional, mas é ele que permite ver os pedidos atribuídos.'
        }
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={pending}>
              Cancelar
            </Button>
            <Button loading={pending} onClick={submit}>
              {editing ? 'Salvar' : 'Cadastrar'}
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="danger" className="mb-3.5">
            {error}
          </Alert>
        )}

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Nome completo" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              maxLength={120}
            />
          </Field>

          <Field label="Telefone" required>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              inputMode="tel"
              placeholder="(11) 98888-0001"
            />
          </Field>

          <Field label="Veículo">
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

        <Field label="E-mail de acesso" required hint="O entregador define sua senha após verificar este endereço. Ao alterar o e-mail, o acesso precisará ser ativado novamente.">
          <Input type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} required maxLength={254} autoComplete="off" />
        </Field>
        <p className="mb-4 text-sm text-ink-500">Compartilhe o link do aplicativo. O titular usa “Primeiro acesso” para receber a ativação; nenhuma senha é exibida ao estabelecimento.</p>
        <section className="mb-4 rounded-lg bg-ink-50 p-3"><h3 className="text-sm font-semibold">Horários de trabalho</h3><p className="mt-1 text-sm text-ink-500">Após salvar, configure os dias, turnos e intervalos na seção de horários desta página. A escala pode atravessar a meia-noite.</p></section>
        {(
          <Checkbox
            label="Entregador ativo (pode receber pedidos)"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
        )}
      </Modal>

      {/* ── Desativar ──────────────────────────────────────────────── */}
      <Modal
        open={confirmDeactivate !== null}
        onClose={() => setConfirmDeactivate(null)}
        title="Desativar entregador"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeactivate(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" loading={pending} onClick={deactivate}>
              Desativar
            </Button>
          </>
        }
      >
        {error && (
          <Alert tone="danger" className="mb-3.5">
            {error}
          </Alert>
        )}
        <p className="text-[0.86rem] leading-relaxed text-ink-600">
          <strong className="text-ink-900">{confirmDeactivate?.name}</strong> sai da lista de
          despacho e o login do app é bloqueado. O histórico de entregas continua intacto — por isso
          não apagamos o cadastro.
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
