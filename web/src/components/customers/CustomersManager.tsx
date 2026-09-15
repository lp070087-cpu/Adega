'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatBRL, formatDateTime, formatPhone, onlyDigits } from '@/lib/utils';
import {
  createCustomerAction,
  deleteCustomerAction,
  updateCustomerAction,
} from '@/app/actions/customers';
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
  Textarea,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CLIENTES
 * -----------------------------------------------------------------------
 * A lista é montada com os números que o servidor já calculou (pedidos,
 * total gasto, ticket médio, último pedido) — nenhum deles é contado no
 * navegador.
 *
 * O telefone é a chave do cliente: criar com um número que já existe
 * ATUALIZA o cadastro em vez de duplicar. É a mesma regra do checkout,
 * e é o que impede a lista de virar uma pilha de repetidos.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  averageTicket: number;
  lastOrderAt: string | null;
};

export type CustomerSummary = {
  total: number;
  withOrders: number;
  revenue: number;
  averageTicket: number;
};

type SortKey = 'recent' | 'spent' | 'orders' | 'name';

export function CustomersManager({
  customers,
  summary,
  canManage,
}: {
  customers: CustomerRow[];
  summary: CustomerSummary;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [onlyWithOrders, setOnlyWithOrders] = useState(false);

  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = onlyDigits(search);

    const filtered = customers.filter((customer) => {
      if (onlyWithOrders && customer.orderCount === 0) return false;
      if (!term) return true;
      return (
        customer.name.toLowerCase().includes(term) ||
        // Busca por telefone ignora máscara: "(11) 9…" e "119…" acham igual.
        (digits.length > 0 && customer.phone.includes(digits)) ||
        (customer.email ?? '').toLowerCase().includes(term)
      );
    });

    const sorted = [...filtered];
    switch (sort) {
      case 'spent':
        sorted.sort((a, b) => b.totalSpent - a.totalSpent);
        break;
      case 'orders':
        sorted.sort((a, b) => b.orderCount - a.orderCount);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => {
          const aDate = a.lastOrderAt ?? a.createdAt;
          const bDate = b.lastOrderAt ?? b.createdAt;
          return bDate.localeCompare(aDate);
        });
    }
    return sorted;
  }, [customers, search, sort, onlyWithOrders]);

  function openCreate() {
    setError(null);
    setForm({ name: '', phone: '', email: '', notes: '' });
    setCreating(true);
  }

  function openEdit(customer: CustomerRow) {
    setError(null);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      notes: '',
    });
    setEditing(customer);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function submit() {
    setError(null);
    const data = new FormData();
    data.set('name', form.name);
    data.set('phone', form.phone);
    data.set('email', form.email);
    data.set('notes', form.notes);

    startTransition(async () => {
      const result = editing
        ? await updateCustomerAction(editing.id, data)
        : await createCustomerAction(data);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      closeForm();
      router.refresh();
    });
  }

  function remove() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setError(null);

    startTransition(async () => {
      const result = await deleteCustomerAction(target.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmDelete(null);
      router.refresh();
    });
  }

  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-4">
      {error && !formOpen && !confirmDelete && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Clientes cadastrados" value={String(summary.total)} />
        <Summary
          label="Já compraram"
          value={String(summary.withOrders)}
          hint={`${summary.total - summary.withOrders} sem pedido`}
        />
        <Summary label="Receita de clientes" value={formatBRL(summary.revenue)} />
        <Summary
          label="Ticket médio"
          value={formatBRL(summary.averageTicket)}
          hint="Por pedido com cliente identificado"
        />
      </div>

      <Card>
        <CardHeader
          title="Clientes"
          subtitle="Pedidos, total gasto e ticket médio saem dos pedidos reais da loja."
          action={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                + Novo cliente
              </Button>
            ) : undefined
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="max-w-xs"
            aria-label="Buscar cliente"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="field-input max-w-[200px] cursor-pointer"
            aria-label="Ordenar por"
          >
            <option value="recent">Mais recentes</option>
            <option value="spent">Quem mais gastou</option>
            <option value="orders">Quem mais pediu</option>
            <option value="name">Nome (A–Z)</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-ink-600">
            <input
              type="checkbox"
              checked={onlyWithOrders}
              onChange={(e) => setOnlyWithOrders(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
            />
            Só quem já comprou
          </label>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="👥"
            title={customers.length === 0 ? 'Nenhum cliente ainda' : 'Nada encontrado'}
            description={
              customers.length === 0
                ? 'Os clientes aparecem aqui automaticamente quando fazem o primeiro pedido pela loja — ou cadastre um manualmente.'
                : 'Ajuste a busca ou os filtros para ver outros clientes.'
            }
            action={
              canManage && customers.length === 0 ? (
                <Button onClick={openCreate}>Cadastrar cliente</Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="mb-3 text-[0.76rem] text-ink-500">
              {visible.length} de {customers.length} cliente
              {customers.length === 1 ? '' : 's'}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-ink-100 text-left">
                    <Th>Cliente</Th>
                    <Th>Contato</Th>
                    <Th className="text-right">Pedidos</Th>
                    <Th className="text-right">Total gasto</Th>
                    <Th className="text-right">Ticket médio</Th>
                    <Th>Último pedido</Th>
                    {canManage && <Th className="text-right">Ações</Th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((customer) => (
                    <tr key={customer.id} className="border-b border-ink-100 last:border-b-0">
                      <td className="py-2.5 pr-4">
                        <p className="text-[0.84rem] font-semibold text-ink-800">{customer.name}</p>
                        <p className="text-[0.7rem] text-ink-400">
                          Cliente desde {formatDateTime(customer.createdAt)}
                        </p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <p className="text-[0.8rem] text-ink-600">
                          {formatPhone(customer.phone)}
                        </p>
                        {customer.email && (
                          <p className="truncate text-[0.7rem] text-ink-400">{customer.email}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {customer.orderCount > 0 ? (
                          <Badge tone="blue">{customer.orderCount}</Badge>
                        ) : (
                          <span className="text-[0.8rem] text-ink-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[0.82rem] font-bold text-ink-900">
                        {formatBRL(customer.totalSpent)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[0.8rem] text-ink-600">
                        {customer.orderCount > 0 ? formatBRL(customer.averageTicket) : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-[0.78rem] text-ink-500">
                        {customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : 'Nunca'}
                      </td>
                      {canManage && (
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => openEdit(customer)}>
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setError(null);
                                setConfirmDelete(customer);
                              }}
                            >
                              Excluir
                            </Button>
                          </div>
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
        title={editing ? 'Editar cliente' : 'Novo cliente'}
        subtitle={
          editing
            ? 'O telefone é a chave do cadastro — mudar o número cria outro cliente.'
            : 'Se o telefone já existir, o cadastro existente é atualizado em vez de duplicar.'
        }
        size="sm"
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

        <Field label="Nome" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            maxLength={120}
          />
        </Field>

        <Field label="Telefone" required hint="Com DDD. É por ele que o cliente é identificado.">
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel"
            placeholder="(11) 98888-0001"
          />
        </Field>

        <Field label="E-mail">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        {!editing && (
          <Field label="Observação" hint="Opcional. Ex.: portaria, sem cebola, ponto de referência.">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
        )}
      </Modal>

      {/* ── Excluir ────────────────────────────────────────────────── */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir cliente"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              Excluir
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
          Excluir <strong className="text-ink-900">{confirmDelete?.name}</strong> remove o cadastro
          do cliente. Os pedidos já feitos continuam no histórico — eles guardam nome e telefone
          próprios, então o faturamento passado não muda.
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
