import { ADEGA_COMMERCIAL_PLAN } from '@/lib/commercial-plan';
import { requireOrgPage } from '@/lib/auth/guards';
import { prisma, toNumber } from '@/lib/db';
import { formatBRL, formatDateTime } from '@/lib/utils';
import { CreditCard, CalendarDays } from 'lucide-react';
import { PlanRequest } from '@/components/store/PlanRequest';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plano e assinatura' };
const statusLabel: Record<string, string> = { TRIAL: 'Em teste', ACTIVE: 'Ativa', PENDING: 'Pendente', PAST_DUE: 'Vencida', SUSPENDED: 'Suspensa', CANCELLED: 'Cancelada', EXPIRED: 'Expirada', PAID: 'Recebida' };
export default async function SubscriptionPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const legacy = await prisma.subscription.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: 'desc' }, include: { plan: true } });
  let current: { name: string; status: string; amount: number; dueAt: Date | null; period: string } | null = legacy ? { name: legacy.plan.name, status: legacy.status, amount: toNumber(legacy.plan.price), dueAt: legacy.expiresAt, period: 'mensal' } : null;
  let charges: Array<{ id: string; competence: string; amount: number; dueAt: Date; status: string }> = [];
  let plans: Array<{ id: string; name: string; price: number; maxUsers: number; maxDrivers: number }> = [];
  let available = false;
  if (process.env.PLATFORM_ADMIN_ENABLED === 'true') {
    try {
      const contract = await prisma.platformContract.findUnique({ where: { organizationId: ctx.organizationId } });
      if (contract) {
        const plan = await prisma.plan.findUnique({ where: { id: contract.planId }, select: { name: true } });
        current = { name: plan?.name ?? 'Plano contratado', status: contract.status, amount: toNumber(contract.amount), dueAt: contract.dueAt, period: contract.period === 'ANNUAL' ? 'anual' : 'mensal' };
      }
      charges = (await prisma.saaSCharge.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { dueAt: 'desc' }, take: 24, select: { id: true, competence: true, amount: true, dueAt: true, status: true } })).map((charge) => ({ ...charge, amount: toNumber(charge.amount) }));
      plans = (await prisma.plan.findMany({ where: { active: true,slug:ADEGA_COMMERCIAL_PLAN.slug,price:ADEGA_COMMERCIAL_PLAN.monthlyPrice }, orderBy: { position: 'asc' }, select: { id: true, name: true, price: true, maxUsers: true, maxDrivers: true } })).map((plan) => ({ ...plan, price: toNumber(plan.price) }));
      available = true;
    } catch { /* Activation may not yet have been approved; preserve legacy reads. */ }
  }
  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Sua conta</p><h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900 mt-1">Plano e assinatura</h2><p className="mt-2 text-sm text-ink-500">Consulte a situação comercial do estabelecimento.</p></header>
    <section className="rounded-xl border border-ink-200 bg-white p-6">
      <CreditCard className="mb-4 h-6 w-6 text-ink-500" aria-hidden="true" />
      {current ? <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{current.name}</h2><span className="rounded-full bg-ink-100 px-3 py-1 text-sm">{statusLabel[current.status] ?? current.status}</span></div><p className="mt-3 text-xl font-semibold">{formatBRL(current.amount)} <span className="text-sm font-normal text-ink-500">/ {current.period}</span></p><p className="mt-4 flex items-center gap-2 text-sm text-ink-600"><CalendarDays size={16} aria-hidden="true" />Vencimento: {current.dueAt ? formatDateTime(current.dueAt) : 'Não definido'}</p></> : <><h2 className="font-semibold">Plano ainda não associado</h2><p className="mt-2 text-sm text-ink-500">A administração confirmará o plano e as condições comerciais da sua loja.</p></>}
    </section>
    <section className="rounded-xl border border-ink-200 bg-white p-6"><h2 className="font-semibold">Cobranças</h2>{charges.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead><tr className="border-b text-ink-500"><th className="py-3">Competência</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{charges.map((charge) => <tr className="border-b last:border-0" key={charge.id}><td className="py-4">{charge.competence}</td><td>{formatDateTime(charge.dueAt)}</td><td>{formatBRL(charge.amount)}</td><td>{statusLabel[charge.status] ?? charge.status}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-ink-500">Nenhuma cobrança registrada.</p>}</section>
    <section className="rounded-xl border border-ink-200 bg-white p-6"><h2 className="text-lg font-semibold">Del Flash Completo</h2><p className="mt-3 text-2xl font-semibold">R$ 119,00<span className="text-sm font-normal text-ink-500"> / mês</span></p><p className="mt-3 text-sm text-ink-600">Uma oferta para organizar sua operação de delivery.</p><ul className="mt-4 space-y-2 text-sm text-ink-600">{ADEGA_COMMERCIAL_PLAN.features.map(feature=><li key={feature}>{feature}</li>)}</ul>{available&&plans[0]?<PlanRequest planId={plans[0].id}/>:<p className="mt-4 text-sm text-ink-500">A administração confirmará a disponibilidade e a ativação comercial. O contrato vigente acima permanece preservado.</p>}</section>
    <p className="text-sm leading-6 text-ink-500">Pagamentos e alterações contratuais são confirmados pela administração. Esta tela não efetua cobrança automática.</p>
  </div>;
}
