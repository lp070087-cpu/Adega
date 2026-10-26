import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationById } from '@/lib/data/organization';
import { fiscalReadiness, readFiscalProfile } from '@/lib/fiscal';
import { FiscalProfileForm } from '@/components/fiscal/FiscalProfileForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documentos fiscais' };

export default async function FiscalSettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const organization = await getOrganizationById(ctx.organizationId);
  const profile = readFiscalProfile(organization?.settings);
  const readiness = fiscalReadiness(profile);
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Documentos fiscais</h2>
      </div>

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
