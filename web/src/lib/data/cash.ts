import 'server-only';
import { OperationError } from '@/lib/operation-error';
import type { PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import { prisma, toNumber } from '@/lib/db';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { startOfDay } from '@/lib/utils';
import { cashHandoffs } from '@/lib/cash-handoff-state';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAIXA — turnos e lançamentos
 * -----------------------------------------------------------------------
 * O saldo esperado é CALCULADO, nunca gravado como contador:
 *   esperado = abertura + vendas em dinheiro + suprimentos − sangrias − estornos
 *
 * Venda em cartão/PIX entra no turno para conferência, mas não no
 * dinheiro em gaveta. Misturar os dois é o jeito clássico de o
 * fechamento nunca bater.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Valores que compõem a gaveta (afetam o dinheiro físico). */
const CASH_TYPES: TransactionType[] = ['SALE', 'SUPPLY', 'WITHDRAWAL', 'REFUND'];

export async function getCashRegisters(organizationId: string) {
  return prisma.cashRegister.findMany({
    where: { organizationId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      _count: { select: { shifts: true } },
      shifts: {
        where: { closedAt: null },
        take: 1,
        include: {
          openedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function createCashRegister(
  organizationId: string,
  input: { name: string; active?: boolean },
) {
  return prisma.cashRegister.create({
    data: { organizationId, name: input.name, active: input.active ?? true },
  });
}

export async function updateCashRegister(
  organizationId: string,
  registerId: string,
  input: { name?: string; active?: boolean },
) {
  const result = await prisma.cashRegister.updateMany({
    where: { id: registerId, organizationId },
    data: input,
  });
  if (result.count === 0) throw new OperationError('Caixa não encontrado.');
  return { ok: true };
}

/** Turno aberto de um caixa, se houver. */
export async function getOpenShift(organizationId: string, cashRegisterId?: string) {
  const shift = await prisma.cashShift.findFirst({
    where: {
      closedAt: null,
      ...(cashRegisterId ? { cashRegisterId } : {}),
      cashRegister: { organizationId },
    },
    include: {
      cashRegister: { select: { id: true, name: true } },
      openedBy: { select: { id: true, name: true } },
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!shift) return null;

  const totals = summarizeShift(
    shift.openingAmount,
    shift.transactions.map((t) => ({
      type: t.type,
      paymentMethod: t.paymentMethod,
      amount: toNumber(t.amount),
    })),
  );

  return {
    ...shift,
    openingAmount: toNumber(shift.openingAmount),
    transactions: shift.transactions.map((t) => ({ ...t, amount: toNumber(t.amount) })),
    totals,
  };
}

export type OpenShift = NonNullable<Awaited<ReturnType<typeof getOpenShift>>>;

/** Totais de um turno: dinheiro em gaveta separado dos demais meios. */
export function summarizeShift(
  openingAmount: unknown,
  transactions: Array<{ type: TransactionType; paymentMethod: PaymentMethod | null; amount: number }>,
) {
  const opening = toNumber(openingAmount);

  let cashSales = 0;
  let cardSales = 0;
  let pixSales = 0;
  let otherSales = 0;
  let supplies = 0;
  let withdrawals = 0;
  let refunds = 0;
  let nonCashRefunds = 0;
  let adjustments = 0;

  for (const t of transactions) {
    switch (t.type) {
      case 'SALE':
        if (t.paymentMethod === 'CASH') cashSales += t.amount;
        else if (t.paymentMethod === 'PIX') pixSales += t.amount;
        else if (t.paymentMethod === 'CREDIT_CARD' || t.paymentMethod === 'DEBIT_CARD')
          cardSales += t.amount;
        else otherSales += t.amount;
        break;
      case 'SUPPLY':
        supplies += t.amount;
        break;
      case 'WITHDRAWAL':
        withdrawals += t.amount;
        break;
      case 'REFUND':
        if(t.paymentMethod === 'CASH' || t.paymentMethod === null) refunds += t.amount;
        else nonCashRefunds += t.amount;
        break;
      case 'ADJUSTMENT':
        adjustments += t.amount;
        break;
    }
  }

  const totalSales = cashSales + cardSales + pixSales + otherSales;
  // Só o que passa pela gaveta.
  const expectedCash =
    opening + cashSales + supplies - withdrawals - refunds + adjustments;

  return {
    opening,
    cashSales: round2(cashSales),
    cardSales: round2(cardSales),
    pixSales: round2(pixSales),
    otherSales: round2(otherSales),
    totalSales: round2(totalSales),
    supplies: round2(supplies),
    withdrawals: round2(withdrawals),
    refunds: round2(refunds),
    nonCashRefunds: round2(nonCashRefunds),
    adjustments: round2(adjustments),
    expectedCash: round2(expectedCash),
    transactionCount: transactions.length,
  };
}

/**
 * Abre turno. Recusa se já houver turno aberto no mesmo caixa — dois
 * turnos abertos no mesmo caixa tornam o fechamento impossível.
 */
export async function openCashShift(
  organizationId: string,
  input: { cashRegisterId: string; openingAmount: number },
  userId: string,
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const register = await tx.cashRegister.findFirst({
    where: { id: input.cashRegisterId, organizationId, active: true },
    select: { id: true, name: true },
  });
  if (!register) throw new OperationError('Caixa não encontrado ou inativo.');

  const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { settings: true } });
  if (cashHandoffs(org.settings).some(h => h.registerId === register.id && h.status === 'PENDING')) {
    throw new OperationError('Este caixa aguarda aceite da transferência pelo próximo operador.');
  }

  const alreadyOpen = await tx.cashShift.findFirst({
    where: { cashRegisterId: register.id, closedAt: null },
    select: { id: true },
  });
  if (alreadyOpen) {
    throw new OperationError(`O caixa "${register.name}" já tem um turno aberto.`);
  }

  const shift = await tx.cashShift.create({
    data: {
      cashRegisterId: register.id,
      openedByUserId: userId,
      openingAmount: input.openingAmount,
    },
  });

  return { ...shift, openingAmount: toNumber(shift.openingAmount), registerName: register.name };
  });
}

/**
 * Fecha o turno. A diferença (contado − esperado) fica gravada: é o
 * número que o lojista usa para saber se faltou dinheiro.
 */
export async function closeCashShift(
  organizationId: string,
  input: { cashShiftId: string; closingAmount: number; notes?: string },
  userId: string,
  supervisor = false,
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const shift = await tx.cashShift.findFirst({
    where: { id: input.cashShiftId, cashRegister: { organizationId } },
    include: { transactions: true, cashRegister: { select: { name: true } } },
  });
  if (!shift) throw new OperationError('Turno não encontrado.');
  if (shift.closedAt) throw new OperationError('Este turno já foi fechado.');
  if(shift.openedByUserId!==userId && (!supervisor || !input.notes || input.notes.trim().length<5))throw new OperationError('Outro operador é responsável por este turno. Peça a passagem do caixa ou registre a justificativa de supervisão.');

  const totals = summarizeShift(
    shift.openingAmount,
    shift.transactions.map((t) => ({
      type: t.type,
      paymentMethod: t.paymentMethod,
      amount: toNumber(t.amount),
    })),
  );

  const difference = round2(input.closingAmount - totals.expectedCash);

  const closed = await tx.cashShift.update({
    where: { id: shift.id },
    data: {
      closedAt: new Date(),
      closedByUserId: userId,
      closingAmount: input.closingAmount,
      differenceAmount: difference,
      notes: shift.openedByUserId!==userId?`Encerramento por supervisão. ${input.notes}`:input.notes ?? null,
    },
  });

  return {
    ...closed,
    closingAmount: toNumber(closed.closingAmount!),
    differenceAmount: toNumber(closed.differenceAmount!),
    totals,
    registerName: shift.cashRegister.name,
  };
  });
}

/** Sangria, suprimento, estorno ou ajuste. */
export async function createCashTransaction(
  organizationId: string,
  input: {
    cashShiftId: string;
    type: 'SUPPLY' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'REFUND';
    amount: number;
    description?: string;
  },
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const shift = await tx.cashShift.findFirst({
    where: { id: input.cashShiftId, cashRegister: { organizationId } },
    select: { id: true, closedAt: true },
  });
  if (!shift) throw new OperationError('Turno não encontrado.');
  if (shift.closedAt) throw new OperationError('Não é possível lançar em um turno já fechado.');

  const transaction = await tx.cashTransaction.create({
    data: {
      cashShiftId: shift.id,
      type: input.type,
      paymentMethod: 'CASH', // sangria/suprimento são sempre em dinheiro
      amount: input.amount,
      description: input.description ?? null,
    },
  });

  return { ...transaction, amount: toNumber(transaction.amount) };
  });
}

/**
 * Lança a venda do pedido no turno aberto.
 * Idempotente: se o pedido já tem lançamento no turno, não duplica.
 */
export async function registerOrderInCash(
  organizationId: string,
  orderId: string,
  paymentMethod: PaymentMethod,
  amount: number,
  transaction?: Prisma.TransactionClient,
) {
  return withOrganizationTransaction(organizationId, async (tx) => {
  const order = await tx.order.findFirst({ where: { id: orderId, organizationId }, select: { id: true } });
  if (!order) throw new OperationError('Pedido não encontrado.');
  const shift = await tx.cashShift.findFirst({
    where: { closedAt: null, cashRegister: { organizationId } },
    select: { id: true },
  });
  // Sem caixa aberto a venda não trava — só não entra no turno.
  if (!shift) return { registered: false, reason: 'Nenhum turno aberto.' };

  const existing = await tx.cashTransaction.findFirst({
    where: { orderId, type: 'SALE', cashShift: { cashRegister: { organizationId } } },
    select: { id: true },
  });
  if (existing) return { registered: false, reason: 'Venda já lançada neste turno.' };

  await tx.cashTransaction.create({
    data: {
      cashShiftId: shift.id,
      orderId,
      type: 'SALE',
      paymentMethod,
      amount,
      description: 'Venda',
    },
  });

  return { registered: true };
  }, transaction);
}

/** Histórico de turnos fechados. */
export async function getCashHistory(
  organizationId: string,
  filters: { from?: Date; to?: Date; cashRegisterId?: string; limit?: number } = {},
) {
  const shifts = await prisma.cashShift.findMany({
    where: {
      cashRegister: { organizationId },
      closedAt: { not: null },
      ...(filters.cashRegisterId ? { cashRegisterId: filters.cashRegisterId } : {}),
      ...(filters.from || filters.to
        ? {
            openedAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { closedAt: 'desc' },
    take: filters.limit ?? 50,
    include: {
      cashRegister: { select: { name: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      transactions: true,
    },
  });

  return shifts.map((s) => {
    const totals = summarizeShift(
      s.openingAmount,
      s.transactions.map((t) => ({
        type: t.type,
        paymentMethod: t.paymentMethod,
        amount: toNumber(t.amount),
      })),
    );
    return {
      id: s.id,
      registerName: s.cashRegister.name,
      openedBy: s.openedBy.name,
      closedBy: s.closedBy?.name ?? null,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingAmount: toNumber(s.openingAmount),
      closingAmount: toNumber(s.closingAmount),
      differenceAmount: toNumber(s.differenceAmount),
      notes: s.notes,
      totals,
    };
  });
}

export type CashHistoryItem = Awaited<ReturnType<typeof getCashHistory>>[number];

/** Resumo do caixa para o topo da página. */
export async function getCashSummary(organizationId: string) {
  const today = startOfDay();

  const open = await getOpenShift(organizationId);

  const closedToday = await prisma.cashShift.findMany({
    where: { cashRegister: { organizationId }, closedAt: { gte: today } },
    include: { transactions: true },
  });

  let closedSales = 0;
  let closedDifference = 0;
  for (const shift of closedToday) {
    const totals = summarizeShift(
      shift.openingAmount,
      shift.transactions.map((t) => ({
        type: t.type,
        paymentMethod: t.paymentMethod,
        amount: toNumber(t.amount),
      })),
    );
    closedSales += totals.totalSales;
    closedDifference += toNumber(shift.differenceAmount);
  }

  return {
    hasOpenShift: Boolean(open),
    openShift: open,
    shiftsClosedToday: closedToday.length,
    closedSales: round2(closedSales),
    closedDifference: round2(closedDifference),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
