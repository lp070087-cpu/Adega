import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationById } from '@/lib/data/organization';
import { fiscalReadiness, readFiscalProfile } from '@/lib/fiscal';
import { FiscalProfileForm } from '@/components/fiscal/FiscalProfileForm';
import { PAYMENT_METHOD_LABEL } from '@/data/business-copy';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pagamentos e fiscal' };

export default async function FiscalSettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const organization = await getOrganizationById(ctx.organizationId);
  const profile = readFiscalProfile(organization?.settings);
  const readiness = fiscalReadiness(profile);
  const methods = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const;
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Pagamentos e documentos fiscais</h2>
        <Link href="/app/configuracoes" className="text-sm font-semibold text-brand">Voltar às configurações</Link>
      </div>

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h3 className="font-semibold text-ink-900">Formas de pagamento aceitas no pedido</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {methods.map((m) => <li key={m} className="rounded-lg bg-ink-50 px-3 py-2 text-sm font-semibold text-ink-800">{PAYMENT_METHOD_LABEL[m] ?? m} <span className="font-normal text-ink-500">· na entrega ou retirada</span></li>)}
        </ul>
        <div className="rounded-lg border border-ink-100 p-3 text-[0.8rem] leading-relaxed text-ink-600">
          <p className="font-semibold text-ink-800">Como a situação do pagamento funciona</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li><strong>A cobrar na entrega</strong>: dinheiro ou cartão informado pelo cliente; vira <strong>Pago</strong> quando a entrega é concluída.</li>
            <li><strong>Aguardando confirmação</strong>: Pix informado; confira o recebimento antes de entregar. Ao concluir a entrega, o pedido é registrado como pago e lançado no caixa.</li>
            <li><strong>Recusado</strong> e <strong>Estornado</strong> são registrados pela equipe no pedido.</li>
            <li>Escolher a forma de pagamento nunca marca o pedido como pago.</li>
          </ul>
        </div>
        <p className="text-[0.78rem] text-ink-500">Pagamento online e TEF (cartão integrado ao caixa) não estão ativos: dependem da escolha de um provedor e de homologação. Nenhuma transação é aprovada automaticamente.</p>
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-900">Documentos fiscais (NFC-e / NF-e)</h3>
          <span className="rounded-full bg-ink-100 px-3 py-1 text-[0.74rem] font-bold text-ink-600" data-testid="fiscal-status">Emissão desativada</span>
        </div>
        <p className="text-[0.8rem] text-ink-500">Preencha o cadastro com seu contador. A emissão só será ligada com provedor homologado, certificado digital e testes na SEFAZ — nenhum documento é emitido ou simulado antes disso.</p>
        <ol className="space-y-1.5 text-[0.8rem]">
          {readiness.map((step) => <li key={step.label} className="flex gap-2"><span aria-hidden className={step.ok ? 'text-success' : 'text-ink-400'}>{step.ok ? '✓' : '○'}</span><span className={step.ok ? 'text-ink-800' : 'text-ink-600'}>{step.label}</span></li>)}
        </ol>
        <FiscalProfileForm profile={profile} />
      </section>
    </div>
  );
}
