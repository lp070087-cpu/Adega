'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { ROLE_LABEL } from '@/data/business-copy';
import {
  createTeamMemberAction,
  removeTeamMemberAction,
  updateTeamMemberAction,
} from '@/app/actions/team';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Modal,
  Select,
  StatCard,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EQUIPE
 * -----------------------------------------------------------------------
 * A lista é o vínculo (OrganizationUser), não uma tabela de funcionários
 * paralela: papel de acesso e pessoa são a mesma coisa.
 *
 * Duas coisas que a tela NÃO deixa fazer, e diz por quê: mexer no
 * proprietário e mexer em si mesmo. Rebaixar a si próprio numa loja com
 * um só dono deixaria o estabelecimento sem ninguém capaz de administrar.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type TeamRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  shift: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type TeamSummary = {
  total: number;
  active: number;
  byRole: Array<{ role: string; count: number }>;
};

/**
 * Papéis oferecidos no <select>. PLATFORM_ADMIN não aparece — quem
 * administra a plataforma não é decidido pela loja. O servidor recusa
 * mesmo que alguém envie o valor por fora.
 */
const ASSIGNABLE_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'ATTENDANT',
  'KITCHEN',
  'DISPATCHER',
  'DRIVER',
] as const;

const ROLE_HINT: Record<string, string> = {
  OWNER: 'Acesso total, inclusive equipe e integrações.',
  ADMIN: 'Acesso total, inclusive equipe e integrações.',
  MANAGER: 'Toda a operação. Não mexe em equipe nem em integrações.',
  ATTENDANT: 'Pedidos, clientes e caixa.',
  KITCHEN: 'Somente pedidos, para o preparo.',
  DISPATCHER: 'Pedidos e entregadores.',
  DRIVER: 'Só o app do entregador, com os próprios pedidos.',
};

export function TeamManager({
  members,
  summary,
  canManage,
  currentUserId,
}: {
  members: TeamRow[];
  summary: TeamSummary;
  canManage: boolean;
  /** Para bloquear as ações que a pessoa não pode fazer sobre si mesma. */
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamRow | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      [m.name, m.email, m.shift ?? '', ROLE_LABEL[m.role] ?? m.role]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [members, search]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível concluir.');
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="👥" label="Pessoas com acesso" value={String(summary.total)} tone="blue" />
        <StatCard
          icon="✅"
          label="Acessos ativos"
          value={String(summary.active)}
          hint={summary.total - summary.active > 0 ? `${summary.total - summary.active} desativado(s)` : 'Todos ativos'}
          tone="green"
        />
        {summary.byRole.slice(0, 2).map((entry) => (
          <StatCard
            key={entry.role}
            icon="🎭"
            label={ROLE_LABEL[entry.role] ?? entry.role}
            value={String(entry.count)}
            tone="purple"
          />
        ))}
      </div>

      <Card>
        <CardHeader
          title="Equipe"
          subtitle="Quem entra no painel e com qual papel"
          action={
            canManage ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                + Adicionar pessoa
              </Button>
            ) : undefined
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou turno"
            className="max-w-[320px]"
            aria-label="Buscar na equipe"
          />
          <span className="text-[0.76rem] text-ink-400">
            {filtered.length} de {members.length}
          </span>
        </div>

        {members.length === 0 ? (
          <p className="py-8 text-center text-[0.84rem] text-ink-400">
            Nenhuma pessoa cadastrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-ink-100 text-left">
                  <Th>Pessoa</Th>
                  <Th>Papel</Th>
                  <Th>Turno</Th>
                  <Th>Último acesso</Th>
                  <Th>Situação</Th>
                  {canManage && <Th className="text-right">Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => {
                  const isOwner = member.role === 'OWNER';
                  const isSelf = member.userId === currentUserId;
                  // A regra também vive no servidor; aqui é só para não
                  // oferecer um botão que vai ser recusado.
                  const locked = isOwner || isSelf;

                  return (
                    <tr key={member.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="py-2.5 pr-4">
                        <p className="text-[0.84rem] font-semibold text-ink-800">
                          {member.name}
                          {isSelf && <span className="ml-2 text-[0.68rem] text-ink-400">(você)</span>}
                        </p>
                        <p className="text-[0.72rem] text-ink-500">{member.email}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={isOwner ? 'orange' : 'neutral'}>
                          {ROLE_LABEL[member.role] ?? member.role}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-[0.8rem] text-ink-600">
                        {member.shift || '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-[0.76rem] text-ink-500">
                        {member.lastLoginAt ? formatDateTime(new Date(member.lastLoginAt)) : 'Nunca entrou'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={member.active ? 'green' : 'red'}>
                          {member.active ? 'Ativo' : 'Desativado'}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={locked || pending}
                              onClick={() => setEditTarget(member)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={locked || pending}
                              onClick={() => setRemoveTarget(member)}
                            >
                              Remover
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[0.72rem] text-ink-400">
          Desativar alguém bloqueia o login na hora — inclusive uma sessão já aberta, porque o
          vínculo é reconferido no banco a cada requisição.
        </p>
      </Card>

      {createOpen && (
        <CreateMemberModal
          pending={pending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(formData) =>
            run(
              () => createTeamMemberAction(formData),
              () => {
                setCreateOpen(false);
                setNotice('Pessoa adicionada à equipe.');
              },
            )
          }
        />
      )}

      {editTarget && (
        <EditMemberModal
          member={editTarget}
          pending={pending}
          isSelf={editTarget.userId === currentUserId}
          onClose={() => setEditTarget(null)}
          onSubmit={(input) =>
            run(
              () => updateTeamMemberAction(input),
              () => {
                setEditTarget(null);
                setNotice('Acesso atualizado.');
              },
            )
          }
        />
      )}

      {removeTarget && (
        <Modal
          open
          onClose={() => setRemoveTarget(null)}
          title="Remover da equipe"
          subtitle={removeTarget.name}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={pending}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() =>
                  run(
                    () => removeTeamMemberAction(removeTarget.id),
                    () => {
                      setRemoveTarget(null);
                      setNotice('Acesso removido.');
                    },
                  )
                }
              >
                Remover acesso
              </Button>
            </>
          }
        >
          <p className="text-[0.84rem] leading-relaxed text-ink-600">
            {removeTarget.name} deixa de entrar neste estabelecimento. Os pedidos, o caixa e os
            lançamentos que essa pessoa fez <strong>continuam no histórico</strong> — eles guardam o
            nome de quem registrou, não um vínculo com o login.
          </p>
          <p className="mt-3 text-[0.8rem] text-ink-500">
            Se a intenção é só tirar o acesso por um tempo, prefira <strong>desativar</strong> em
            Editar: volta com um clique e mantém o vínculo.
          </p>
        </Modal>
      )}
    </div>
  );
}

// ── MODAL: NOVA PESSOA ─────────────────────────────────────────────────

function CreateMemberModal({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'ATTENDANT',
    shift: '',
    password: '',
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar pessoa"
      subtitle="Um acesso por pessoa. O papel define o que ela enxerga."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set('name', form.name);
              fd.set('email', form.email);
              fd.set('phone', form.phone);
              fd.set('role', form.role);
              fd.set('shift', form.shift);
              fd.set('password', form.password);
              onSubmit(fd);
            }}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Nome" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field label="E-mail" required hint="É com ele que a pessoa entra.">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Telefone">
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel"
          />
        </Field>
        <Field label="Turno" hint="Texto livre: Manhã, Noite…">
          <Input
            value={form.shift}
            onChange={(e) => setForm({ ...form, shift: e.target.value })}
            maxLength={40}
          />
        </Field>
      </div>

      <Field label="Papel" hint={ROLE_HINT[form.role]}>
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABEL[role] ?? role}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Senha inicial"
        hint="A pessoa entra com ela e o app pede a troca no primeiro acesso. Se o e-mail já existir na plataforma, a senha atual continua valendo."
      >
        <Input
          type="text"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
        />
      </Field>

      <Alert tone="neutral">
        O papel <strong>Proprietário</strong> dá acesso total, inclusive a esta tela. Só use quando
        a pessoa for realmente dona do estabelecimento.
      </Alert>
    </Modal>
  );
}

// ── MODAL: EDITAR ──────────────────────────────────────────────────────

function EditMemberModal({
  member,
  pending,
  isSelf,
  onClose,
  onSubmit,
}: {
  member: TeamRow;
  pending: boolean;
  isSelf: boolean;
  onClose: () => void;
  onSubmit: (input: { memberId: string; role?: Role; active?: boolean; shift?: string }) => void;
}) {
  const [role, setRole] = useState<Role>(member.role as Role);
  const [shift, setShift] = useState(member.shift ?? '');
  const [active, setActive] = useState(member.active);

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar acesso"
      subtitle={member.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            onClick={() =>
              onSubmit({
                memberId: member.id,
                role,
                active,
                shift,
              })
            }
          >
            Salvar
          </Button>
        </>
      }
    >
      {isSelf && (
        <Alert tone="warn" title="Você está editando o próprio acesso">
          O papel e a situação ficam travados: ninguém se rebaixa nem se desliga por aqui. Peça a
          outro proprietário, se for o caso.
        </Alert>
      )}

      <Field label="Papel" hint={ROLE_HINT[role]}>
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          disabled={isSelf || member.role === 'OWNER'}
        >
          {ASSIGNABLE_ROLES.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option] ?? option}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Turno">
        <Input value={shift} onChange={(e) => setShift(e.target.value)} maxLength={40} />
      </Field>

      <Field label="Situação" hint="Desativar bloqueia o login imediatamente.">
        <Select
          value={active ? '1' : '0'}
          onChange={(e) => setActive(e.target.value === '1')}
          disabled={isSelf || member.role === 'OWNER'}
        >
          <option value="1">Ativo</option>
          <option value="0">Desativado</option>
        </Select>
      </Field>

      {member.role === 'OWNER' && (
        <Alert tone="neutral">
          O proprietário não é alterado por esta tela. Isso evita que uma loja fique sem ninguém
          capaz de administrá-la.
        </Alert>
      )}
    </Modal>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap pb-2 pr-4 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500 ${
        className ?? ''
      }`}
    >
      {children}
    </th>
  );
}
