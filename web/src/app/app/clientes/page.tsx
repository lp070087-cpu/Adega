import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getCustomers, getCustomerSummary } from '@/lib/data/customers';
import { CustomersManager } from '@/components/customers/CustomersManager';
import type { CustomerRow } from '@/components/customers/CustomersManager';

export const metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CLIENTES
 * -----------------------------------------------------------------------
 * Só os clientes DESTA organização. Nenhuma métrica é gravada como
 * contador: pedidos, total gasto e ticket médio são derivados dos
 * pedidos reais, então não há como divergirem do histórico.
 *
 * O telefone é dado pessoal — a lista fica atrás de VIEW_CUSTOMERS, e o
 * entregador não tem essa permissão.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function CustomersPage() {
  const ctx = await requireOrgPage('VIEW_CUSTOMERS');

  const [page, summary] = await Promise.all([
    getCustomers(ctx.organizationId, { perPage: 300 }),
    getCustomerSummary(ctx.organizationId),
  ]);

  const customers: CustomerRow[] = page.items.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    createdAt: customer.createdAt.toISOString(),
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent,
    averageTicket: customer.averageTicket,
    lastOrderAt: customer.lastOrderAt ? customer.lastOrderAt.toISOString() : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Clientes</h2>
        <p className="text-[0.8rem] text-ink-500">
          Quem compra na sua loja, quanto gasta e quando pediu pela última vez.
        </p>
      </div>

      <CustomersManager
        customers={customers}
        summary={{
          total: summary.total,
          withOrders: summary.withOrders,
          revenue: summary.revenue,
          averageTicket: summary.averageTicket,
        }}
        canManage={can(ctx.role, 'MANAGE_ORDERS')}
      />
    </div>
  );
}
