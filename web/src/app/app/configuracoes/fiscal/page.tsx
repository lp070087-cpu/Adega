import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationById } from '@/lib/data/organization';
import { fiscalReadiness, readFiscalProfile } from '@/lib/fiscal';
import { FiscalProfileForm } from '@/components/fiscal/FiscalProfileForm';
import { FiscalProviderForm } from '@/components/fiscal/FiscalProviderForm';
import { fiscalEmissionAllowed, homologationPassed, readFiscalProvider } from '@/lib/fiscal-provider';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documentos fiscais' };

export default async function FiscalSettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const organization = await getOrganizationById(ctx.organizationId);
  const profile = readFiscalProfile(organization?.settings);
  const provider = readFiscalProvider(organization?.settings);
  const homologated = provider.encrypted ? await homologationPassed(ctx.organizationId) : false;
  const readiness = fiscalReadiness(profile, { configured: Boolean(provider.encrypted), homologated });
  const allowed = fiscalEmissionAllowed(provider);
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Documentos fiscais</h2>
      </div>

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-900">Documentos fiscais (NFC-e / NF-e)</h3>
          <span className={`rounded-full px-3 py-1 text-[0.74rem] font-bold ${allowed ? (provider.environment === 'producao' ? 'bg-success-bg text-success' : 'bg-warn-bg text-warn') : 'bg-ink-100 text-ink-600'}`} data-testid="fiscal-status">{!allowed ? 'Emissão desativada' : provider.environment === 'producao' ? 'Emissão em produção' : 'Homologação (teste)'}</span>
        </div>
        <p className="text-[0.8rem] text-ink-500">Preencha o cadastro com seu contador. A NFC-e é emitida por um provedor homologado (Focus NFe), que guarda o certificado digital e o CSC e fala com a SEFAZ. Em homologação as notas não têm valor fiscal; a produção é liberada pela plataforma depois dos testes. Nenhum documento é gerado sem a resposta da SEFAZ.</p>
        <ol className="space-y-1.5 text-[0.8rem]">
          {readiness.map((step) => <li key={step.label} className="flex gap-2"><span aria-hidden className={step.ok ? 'text-success' : 'text-ink-400'}>{step.ok ? '✓' : '○'}</span><span className={step.ok ? 'text-ink-800' : 'text-ink-600'}>{step.label}</span></li>)}
        </ol>
        <FiscalProfileForm profile={profile} />
      </section>

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h3 className="font-semibold text-ink-900">Provedor de emissão</h3>
        <FiscalProviderForm configured={Boolean(provider.encrypted)} environment={provider.environment} />
      </section>
    </div>
  );
}
