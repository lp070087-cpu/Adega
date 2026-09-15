import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getCashRegisters, getCashSummary, getCashHistory } from '@/lib/data/cash';
import { CashManager } from '@/components/cash/CashManager';
import type {
  CashHistoryView,
  CashRegisterView,
  OpenShiftView,
} from '@/components/cash/CashManager';

export const metadata = { title: 'Caixa' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAIXA
 * -----------------------------------------------------------------------
 * O servidor entrega o turno aberto já com os totais calculados. A tela
 * não soma nada: se o valor aparece como "esperado em gaveta", veio da
 * agregação dos lançamentos no banco.
 *
 * Nenhum campo aqui aceita valor vindo do cliente como verdade — abrir,
 * lançar e fechar passam por server actions que recalculam do zero.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function CashPage() {
  const ctx = await requireOrgPage('MANAGE_CASH');

  const [registersRaw, summary, historyRaw] = await Promise.all([
    getCashRegisters(ctx.organizationId),
    getCashSummary(ctx.organizationId),
    getCashHistory(ctx.organizationId, { limit: 50 }),
  ]);

  const registers: CashRegisterView[] = registersRaw.map((register) => ({
    id: register.id,
    name: register.name,
    active: register.active,
    openShiftId: register.shifts[0]?.id ?? null,
  }));

  const openShift: OpenShiftView = summary.openShift
    ? {
        id: summary.openShift.id,
        registerName: summary.openShift.cashRegister.name,
        openedByName: summary.openShift.openedBy.name,
        openedAt: summary.openShift.openedAt.toISOString(),
        openingAmount: summary.openShift.openingAmount,
        totals: summary.openShift.totals,
        transactions: summary.openShift.transactions.map((transaction) => ({
          id: transaction.id,
          type: transaction.type,
          paymentMethod: transaction.paymentMethod,
          amount: transaction.amount,
          description: transaction.description,
          createdAt: transaction.createdAt.toISOString(),
        })),
      }
    : null;

  const history: CashHistoryView[] = historyRaw.map((shift) => ({
    id: shift.id,
    registerName: shift.registerName,
    openedBy: shift.openedBy,
    closedBy: shift.closedBy,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
    openingAmount: shift.openingAmount,
    closingAmount: shift.closingAmount,
    differenceAmount: shift.differenceAmount,
    notes: shift.notes,
    // O histórico guarda os totais aninhados; a tabela mostra os dois
    // números lado a lado, então eles são achatados aqui.
    totalSales: shift.totals.totalSales,
    expectedCash: shift.totals.expectedCash,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Caixa</h2>
        <p className="text-[0.8rem] text-ink-500">
          Turnos, sangrias e conferência de gaveta. O esperado é calculado pelo servidor.
        </p>
      </div>

      <CashManager
        registers={registers}
        openShift={openShift}
        history={history}
        closedToday={{
          shifts: summary.shiftsClosedToday,
          sales: summary.closedSales,
          difference: summary.closedDifference,
        }}
        canManage={can(ctx.role, 'MANAGE_CASH')}
      />
    </div>
  );
}
