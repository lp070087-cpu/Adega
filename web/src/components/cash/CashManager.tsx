'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatBRL, formatDateTime, formatTime } from '@/lib/utils';
import {
  closeShiftAction,
  createCashTransactionAction,
  openShiftAction,
} from '@/app/actions/cash';
import { PAYMENT_METHOD_LABEL, TRANSACTION_TYPE_LABEL } from '@/data/business-copy';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Select,
  Textarea,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAIXA
 * -----------------------------------------------------------------------
 * Abrir turno → acompanhar a gaveta → sangria/suprimento → fechar turno.
 *
 * O "esperado em gaveta" é calculado no servidor (abertura + dinheiro −
 * sangrias + suprimentos). Esta tela só exibe; o fechamento compara o
 * valor contado com o esperado e grava a diferença.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type ShiftTotals = {
  opening: number;
  cashSales: number;
  cardSales: number;
  pixSales: number;
  otherSales: number;
  totalSales: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  adjustments: number;
  expectedCash: number;
  transactionCount: number;
};

export type ShiftTransaction = {
  id: string;
  type: string;
  paymentMethod: string | null;
  amount: number;
  description: string | null;
  createdAt: string;
};

export type OpenShiftView = {
  id: string;
  registerName: string;
  openedByName: string;
  openedAt: string;
  openingAmount: number;
  totals: ShiftTotals;
  transactions: ShiftTransaction[];
} | null;

export type CashRegisterView = {
  id: string;
  name: string;
  active: boolean;
  openShiftId: string | null;
};

export type CashHistoryView = {
  id: string;
  registerName: string;
  openedBy: string;
  closedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  closingAmount: number;
  differenceAmount: number;
  notes: string | null;
  totalSales: number;
  expectedCash: number;
};

function parseMoney(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CashManager({
  registers,
  openShift,
  history,
  closedToday,
  canManage,
}: {
  registers: CashRegisterView[];
  openShift: OpenShiftView;
  history: CashHistoryView[];
  closedToday: { shifts: number; sales: number; difference: number };
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const activeRegisters = registers.filter((register) => register.active);

  // Abrir turno
  const [openModal, setOpenModal] = useState(false);
  const [registerId, setRegisterId] = useState(activeRegisters[0]?.id ?? '');
  const [openingAmount, setOpeningAmount] = useState('');

  // Sangria / suprimento
  const [movementType, setMovementType] = useState<
    'WITHDRAWAL' | 'SUPPLY' | 'REFUND' | 'ADJUSTMENT' | null
  >(null);
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  // Fechar turno
  const [closeModal, setCloseModal] = useState(false);
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNote, setClosingNote] = useState('');

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  const expected = openShift?.totals.expectedCash ?? 0;
  const counted = parseMoney(closingAmount);
  const difference = counted - expected;

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      {/* ── Resumo do dia ─────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Vendas no turno atual"
          value={formatBRL(openShift?.totals.totalSales ?? 0)}
          hint={openShift ? `${openShift.transactions.length} lançamentos` : 'Sem turno aberto'}
          tone="orange"
        />
        <SummaryCard
          label="Dinheiro em gaveta"
          value={formatBRL(expected)}
          hint={openShift ? 'Abertura + dinheiro − sangrias' : 'Sem turno aberto'}
          tone="green"
        />
        <SummaryCard
          label="Turnos fechados hoje"
          value={String(closedToday.shifts)}
          hint={
            closedToday.shifts > 0
              ? `${formatBRL(closedToday.sales)} vendidos · quebra ${formatBRL(closedToday.difference)}`
              : 'Nenhum fechamento hoje'
          }
          tone="blue"
        />
      </div>

      {/* ── Turno atual ───────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Turno atual"
          subtitle={openShift ? `${openShift.registerName} · aberto por ${openShift.openedByName}` : undefined}
          action={
            openShift && canManage ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMovementType('SUPPLY');
                    setMovementAmount('');
                    setMovementNote('');
                  }}
                  disabled={pending}
                >
                  Suprimento
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMovementType('WITHDRAWAL');
                    setMovementAmount('');
                    setMovementNote('');
                  }}
                  disabled={pending}
                >
                  Sangria
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setClosingAmount('');
                    setClosingNote('');
                    setCloseModal(true);
                  }}
                  disabled={pending}
                >
                  Fechar caixa
                </Button>
              </div>
            ) : null
          }
        />

        {!openShift ? (
          <EmptyState
            icon="🧾"
            title="Nenhum caixa aberto"
            description={
              activeRegisters.length === 0
                ? 'Não há caixa cadastrado para esta loja. Cadastre um em Configurações.'
                : 'Abra um turno para começar a registrar as vendas em dinheiro.'
            }
            action={
              canManage && activeRegisters.length > 0 ? (
                <Button
                  onClick={() => {
                    setOpeningAmount('');
                    setOpenModal(true);
                  }}
                >
                  Abrir caixa
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div>
                <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <Line label="Abertura" value={formatBRL(openShift.totals.opening)} />
                  <Line
                    label="Dinheiro"
                    value={formatBRL(openShift.totals.cashSales)}
                    hint="entra na gaveta"
                  />
                  <Line label="PIX" value={formatBRL(openShift.totals.pixSales)} hint="não entra" />
                  <Line
                    label="Cartão"
                    value={formatBRL(openShift.totals.cardSales)}
                    hint="não entra"
                  />
                  {openShift.totals.supplies > 0 && (
                    <Line
                      label="Suprimentos"
                      value={`+ ${formatBRL(openShift.totals.supplies)}`}
                      hint="entra na gaveta"
                    />
                  )}
                  {openShift.totals.withdrawals > 0 && (
                    <Line
                      label="Sangrias"
                      value={`− ${formatBRL(openShift.totals.withdrawals)}`}
                      hint="sai da gaveta"
                    />
                  )}
                  {openShift.totals.refunds > 0 && (
                    <Line
                      label="Estornos"
                      value={`− ${formatBRL(openShift.totals.refunds)}`}
                      hint="sai da gaveta"
                    />
                  )}
                </dl>

                <div className="mt-4 rounded border-2 border-brand/25 bg-brand-light px-4 py-3">
                  <p className="text-[0.76rem] font-semibold text-ink-600">
                    Esperado em gaveta agora
                  </p>
                  <p className="text-[1.5rem] font-extrabold leading-tight text-brand">
                    {formatBRL(expected)}
                  </p>
                  <p className="mt-0.5 text-[0.7rem] text-ink-500">
                    Calculado no servidor a partir dos lançamentos do turno.
                  </p>
                </div>
              </div>

              <div className="rounded border border-ink-100">
                <p className="border-b border-ink-100 px-3.5 py-2.5 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
                  Lançamentos do turno
                </p>
                {openShift.transactions.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[0.78rem] text-ink-400">
                    Nenhum lançamento ainda.
                  </p>
                ) : (
                  <ul className="max-h-[280px] divide-y divide-ink-100 overflow-y-auto">
                    {openShift.transactions.map((transaction) => (
                      <li key={transaction.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8rem] font-semibold text-ink-700">
                            {transaction.description ??
                              TRANSACTION_TYPE_LABEL[transaction.type] ??
                              transaction.type}
                          </span>
                          <span className="block text-[0.7rem] text-ink-400">
                            {formatTime(transaction.createdAt)}
                            {transaction.paymentMethod
                              ? ` · ${PAYMENT_METHOD_LABEL[transaction.paymentMethod] ?? transaction.paymentMethod}`
                              : ''}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex-shrink-0 text-[0.82rem] font-bold',
                            ['WITHDRAWAL', 'REFUND'].includes(transaction.type)
                              ? 'text-danger'
                              : 'text-ink-800',
                          )}
                        >
                          {['WITHDRAWAL', 'REFUND'].includes(transaction.type) ? '−' : '+'}
                          {formatBRL(transaction.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <p className="mt-4 text-[0.72rem] text-ink-400">
              Aberto em {formatDateTime(openShift.openedAt)} · PIX e cartão ficam registrados no
              turno para conferência, mas não entram no dinheiro em gaveta.
            </p>
          </>
        )}
      </Card>

      {/* ── Histórico ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader title="Histórico de turnos" subtitle="Últimos 50 turnos fechados" />
        {history.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Nenhum turno fechado"
            description="O histórico aparece aqui depois do primeiro fechamento de caixa."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-ink-100 text-left">
                  <Th>Caixa</Th>
                  <Th>Responsáveis</Th>
                  <Th>Período</Th>
                  <Th className="text-right">Vendas</Th>
                  <Th className="text-right">Esperado</Th>
                  <Th className="text-right">Contado</Th>
                  <Th className="text-right">Diferença</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((shift) => (
                  <tr key={shift.id} className="border-b border-ink-100 last:border-b-0">
                    <td className="py-2.5 pr-4 text-[0.82rem] font-semibold text-ink-800">
                      {shift.registerName}
                    </td>
                    <td className="py-2.5 pr-4 text-[0.76rem] text-ink-500">
                      {shift.openedBy}
                      {shift.closedBy ? ` → ${shift.closedBy}` : ''}
                    </td>
                    <td className="py-2.5 pr-4 text-[0.76rem] text-ink-500">
                      {formatDateTime(shift.openedAt)}
                      {shift.closedAt ? ` — ${formatTime(shift.closedAt)}` : ''}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.82rem] text-ink-700">
                      {formatBRL(shift.totalSales)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.82rem] text-ink-700">
                      {formatBRL(shift.expectedCash)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-[0.82rem] text-ink-700">
                      {formatBRL(shift.closingAmount)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          'text-[0.82rem] font-bold',
                          Math.abs(shift.differenceAmount) < 0.01
                            ? 'text-ink-500'
                            : shift.differenceAmount > 0
                              ? 'text-info'
                              : 'text-danger',
                        )}
                      >
                        {shift.differenceAmount > 0 ? '+' : ''}
                        {formatBRL(shift.differenceAmount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[0.72rem] text-ink-400">
          Diferença = valor contado − esperado. Positivo é sobra, negativo é falta. Nenhum dos dois
          é corrigido automaticamente: fica registrado para conferência.
        </p>
      </Card>

      {/* ── Abrir turno ───────────────────────────────────────────── */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Abrir caixa"
        subtitle="Informe o valor que já está na gaveta antes da primeira venda."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenModal(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    openShiftAction({
                      cashRegisterId: registerId,
                      openingAmount: parseMoney(openingAmount),
                    }),
                  () => setOpenModal(false),
                )
              }
            >
              Abrir turno
            </Button>
          </>
        }
      >
        <Field label="Caixa" required>
          <Select value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
            {activeRegisters.map((register) => (
              <option key={register.id} value={register.id} disabled={Boolean(register.openShiftId)}>
                {register.name}
                {register.openShiftId ? ' (turno aberto)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Valor de abertura" required hint="Troco inicial em dinheiro.">
          <MoneyInput
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </Field>

        <Alert tone="neutral">
          Um caixa não aceita dois turnos abertos ao mesmo tempo — se já houver um aberto, o
          sistema recusa e avisa.
        </Alert>
      </Modal>

      {/* ── Sangria / suprimento ──────────────────────────────────── */}
      <Modal
        open={movementType !== null}
        onClose={() => setMovementType(null)}
        title={movementType === 'WITHDRAWAL' ? 'Sangria' : 'Suprimento'}
        subtitle={
          movementType === 'WITHDRAWAL'
            ? 'Retirada de dinheiro da gaveta.'
            : 'Entrada de dinheiro na gaveta.'
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMovementType(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    createCashTransactionAction({
                      cashShiftId: openShift!.id,
                      type: movementType!,
                      amount: parseMoney(movementAmount),
                      description: movementNote.trim() || undefined,
                    }),
                  () => setMovementType(null),
                )
              }
            >
              Lançar
            </Button>
          </>
        }
      >
        <Field label="Valor" required>
          <MoneyInput
            value={movementAmount}
            onChange={(e) => setMovementAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </Field>
        <Field label="Motivo" hint="Ex.: troco do banco, depósito, pagamento de fornecedor.">
          <Textarea
            value={movementNote}
            onChange={(e) => setMovementNote(e.target.value)}
            rows={2}
            maxLength={300}
          />
        </Field>
      </Modal>

      {/* ── Fechar turno ──────────────────────────────────────────── */}
      <Modal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        title="Fechar caixa"
        subtitle="Conte o dinheiro da gaveta e informe o valor."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseModal(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    closeShiftAction({
                      cashShiftId: openShift!.id,
                      closingAmount: parseMoney(closingAmount),
                      notes: closingNote.trim() || undefined,
                    }),
                  () => setCloseModal(false),
                )
              }
            >
              Confirmar fechamento
            </Button>
          </>
        }
      >
        <Field label="Valor contado" required hint="Total em dinheiro na gaveta neste momento.">
          <MoneyInput
            value={closingAmount}
            onChange={(e) => setClosingAmount(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </Field>

        <div className="mb-3.5 rounded border border-ink-100 bg-ink-50 px-3.5 py-3 text-[0.82rem]">
          <Line label="Esperado" value={formatBRL(expected)} />
          <Line label="Contado" value={formatBRL(counted)} />
          <div className="mt-1.5 flex justify-between border-t border-ink-200 pt-1.5 font-bold">
            <span className="text-ink-700">Diferença</span>
            <span
              className={cn(
                Math.abs(difference) < 0.01
                  ? 'text-success'
                  : difference > 0
                    ? 'text-info'
                    : 'text-danger',
              )}
            >
              {difference > 0 ? '+' : ''}
              {formatBRL(difference)}
            </span>
          </div>
        </div>

        {Math.abs(difference) >= 0.01 && (
          <Alert tone={difference < 0 ? 'warn' : 'info'} className="mb-3.5">
            {difference < 0
              ? 'O valor contado é menor que o esperado. A diferença fica registrada no fechamento.'
              : 'O valor contado é maior que o esperado. A diferença fica registrada no fechamento.'}
          </Alert>
        )}

        <Field label="Observação" hint="Opcional — útil quando a diferença precisa de explicação.">
          <Textarea
            value={closingNote}
            onChange={(e) => setClosingNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </Field>
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'orange' | 'green' | 'blue';
}) {
  const tones = {
    orange: 'bg-brand-light text-brand',
    green: 'bg-success-bg text-success',
    blue: 'bg-info-bg text-info',
  };
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', tones[tone])} aria-hidden />
        <p className="text-[0.76rem] font-medium text-ink-500">{label}</p>
      </div>
      <p className="text-[1.35rem] font-extrabold leading-none text-ink-900">{value}</p>
      <p className="mt-1.5 text-[0.72rem] text-ink-400">{hint}</p>
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[0.82rem] text-ink-500">
        {label}
        {hint && <span className="ml-1 text-[0.68rem] text-ink-300">({hint})</span>}
      </dt>
      <dd className="text-[0.82rem] font-semibold text-ink-800">{value}</dd>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'pb-2 pr-4 text-[0.7rem] font-bold uppercase tracking-wide text-ink-500',
        className,
      )}
    >
      {children}
    </th>
  );
}
