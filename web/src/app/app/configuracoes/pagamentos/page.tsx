import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationById } from '@/lib/data/organization';
import { PAYMENT_METHOD_LABEL } from '@/data/business-copy';
import { OnlinePaymentForm } from '@/components/fiscal/OnlinePaymentForm';
import { onlinePaymentUsable, readOnlinePayment } from '@/lib/order-payments';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagamentos' };

export default async function PaymentsSettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const organization = await getOrganizationById(ctx.organizationId);
  const online = readOnlinePayment(organization?.settings);
  const methods = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const;
  const app = process.env.APP_PUBLIC_URL ?? 'https://adega-nine.vercel.app';
  return (
    <div className="max-w-3xl space-y-5">
      <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Pagamentos</h2>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h3 className="font-semibold text-ink-900">Formas de pagamento aceitas no pedido</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {methods.map((m) => <li key={m} className="rounded-lg bg-ink-50 px-3 py-2 text-sm font-semibold text-ink-800">{PAYMENT_METHOD_LABEL[m] ?? m} <span className="font-normal text-ink-500">· na entrega ou retirada</span></li>)}
        </ul>
        <div className="rounded-lg border border-ink-100 p-3 text-[0.8rem] leading-relaxed text-ink-600">
          <p className="font-semibold text-ink-800">Como a situação do pagamento funciona</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li><strong>A cobrar na entrega</strong>: dinheiro ou cartão informado pelo cliente; vira <strong>Pago</strong> quando a entrega é concluída.</li>
            <li><strong>Aguardando confirmação</strong>: Pix informado na entrega; confira o recebimento antes de entregar. Ao concluir a entrega, o pedido é registrado como pago e lançado no caixa.</li>
            <li><strong>Pagamento online</strong>: fica pago só quando o provedor (Mercado Pago ou Asaas) confirma pelo webhook assinado.</li>
            <li><strong>Recusado</strong> e <strong>Estornado</strong> são registrados pela equipe no pedido.</li>
            <li>Escolher a forma de pagamento nunca marca o pedido como pago.</li>
          </ul>
        </div>
        <p className="text-[0.78rem] text-ink-500">TEF (cartão integrado ao caixa) não faz parte desta versão. Nenhuma transação é aprovada sem confirmação do provedor.</p>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <OnlinePaymentForm enabled={online.enabled} environment={online.environment} provider={online.provider} configured={Boolean(online.encrypted)} usable={onlinePaymentUsable(online)} webhookUrls={{ asaas: `${app}/api/webhooks/pedidos/asaas/${organization?.slug ?? ''}`, mercadopago: `${app}/api/webhooks/pedidos/mercadopago/${organization?.slug ?? ''}` }} />
      </section>
    </div>
  );
}
