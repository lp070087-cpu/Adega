import { requireOrgPage } from '@/lib/auth/guards';
import { FISCAL_URLS, fiscalProfileProblems, readFiscalProfile, readProductFiscal } from '@/lib/fiscal';
import { BR_UFS } from '@/lib/br-ufs';
import { isEncryptionConfigured } from '@/lib/crypto';
import { prisma } from '@/lib/db';
import { FiscalProfileForm } from '@/components/fiscal/FiscalProfileForm';
import { FiscalProviderForm } from '@/components/fiscal/FiscalProviderForm';
import { FiscalCatalogForm } from '@/components/fiscal/FiscalCatalogForm';
import { FiscalHomologationForm } from '@/components/fiscal/FiscalHomologationForm';
import { fiscalIssuer, homologationPassed, readFiscalProvider, readFiscalTest } from '@/lib/fiscal-provider';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Documentos fiscais' };

export default async function FiscalSettingsPage() {
  const { organizationId } = await requireOrgPage('MANAGE_SETTINGS');
  const [org, catalog, lastTest] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { state: true, settings: true } }),
    prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, active: true, price: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    readFiscalTest(organizationId),
  ]);
  const profile = readFiscalProfile(org.settings);
  const suggestedUf = BR_UFS.find((uf) => uf === org.state?.trim().toUpperCase());
  const provider = readFiscalProvider(org.settings);
  const fiscalProblems = fiscalProfileProblems(profile);
  const homologated = await homologationPassed(organizationId, org.settings);
  const canActivate = homologated && process.env.FISCAL_PRODUCTION === 'true';
  const configured = { homologacao: Boolean(provider.credentials.homologacao), producao: Boolean(provider.credentials.producao) };
  const products = catalog.map(({ id, name }) => ({ id, name, fiscal: readProductFiscal(org.settings, id) }));
  const testProducts = catalog.filter(({ id, active, price }) => active && Number(price) > 0 && readProductFiscal(org.settings, id))
    .map(({ id, name }) => ({ id, name }));
  const status = provider.environment === 'producao' && canActivate && configured.producao && provider.productionIssuer === fiscalIssuer(profile) ? 'Produção ativa' :
    configured.homologacao && !fiscalProblems.length ? 'Homologação disponível' : 'Configuração pendente';
  return (
    <div className="max-w-3xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Documentos fiscais</h2>
          <p className="text-sm text-ink-600">NFC-e (modelo 65) para vendas ao consumidor na UF do estabelecimento.</p></div>
        <span className="rounded-full bg-brand-light px-3 py-1 text-xs font-bold text-brand-dark" data-testid="fiscal-status">{status}</span>
      </header>
      <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-ink-900">Credenciamento na SEFAZ</h3>
        <p className="text-sm text-ink-600">O responsável legal ou contador deve acessar a SEFAZ da UF da loja e solicitar credenciamento e CSC para cada ambiente. Em Pernambuco, use o e-Fisco para acessar os serviços da SEFAZ-PE.</p>
        <div className="flex flex-wrap gap-2">
          <PortalLink href={FISCAL_URLS.gov}>Entrar no gov.br</PortalLink>
          <PortalLink href={FISCAL_URLS.peAccess}>Entrar no e-Fisco PE</PortalLink>
          <PortalLink href={FISCAL_URLS.pe}>Credenciamento e CSC · PE</PortalLink>
          <PortalLink href={FISCAL_URLS.national}>Portais e Secretarias de Fazenda</PortalLink>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-ink-900">Dados do estabelecimento</h3>
        {fiscalProblems.length > 0 && <p className="text-sm text-ink-600">Para emitir, preencha {fiscalProblems.join(', ')}.</p>}
        <FiscalProfileForm profile={{ ...profile, uf: profile.uf || suggestedUf || '' }} />
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink-900">Provedor de emissão</h3>
          <PortalLink href={FISCAL_URLS.provider}>Configurar a Focus NFe</PortalLink>
        </div>
        <FiscalProviderForm initialEnvironment={provider.environment} configured={configured} canActivate={canActivate} secureStorage={isEncryptionConfigured()} />
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-ink-900">Tributação por produto</h3>
        <p className="text-sm text-ink-600">Use os códigos e alíquotas validados pelo seu contador. O cadastro de um produto serve para testar. Para emitir pedidos, cada item da venda precisa ter seu próprio cadastro.</p>
        <FiscalCatalogForm products={products} />
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-ink-900">Teste de homologação</h3>
        <p className="text-sm text-ink-600">A nota de teste vai à SEFAZ em homologação e não tem valor fiscal. O teste não movimenta pedidos, caixa ou estoque.</p>
        {homologated && <p role="status" className="text-sm font-semibold text-ink-800">A SEFAZ já autorizou uma NFC-e de teste para este emitente.</p>}
        <FiscalHomologationForm products={testProducts} lastTest={lastTest} ready={configured.homologacao && !fiscalProblems.length} />
      </section>
    </div>
  );
}

function PortalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 px-3 text-sm font-semibold text-brand hover:bg-ink-50">{children}</a>;
}
