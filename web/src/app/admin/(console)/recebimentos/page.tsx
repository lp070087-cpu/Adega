import { AdminHeader, Panel } from '@/components/admin/Display';
import { SaasPaymentSetup } from '@/components/admin/SaasPaymentSetup';
import { requirePlatformRole } from '@/lib/platform/auth';
import { readSaasReceiver } from '@/lib/platform/saas-infinitepay';

export default async function SaasPaymentPage() {
  await requirePlatformRole(['OWNER']);
  const { handle, encryptedKey } = await readSaasReceiver();
  return <>
    <AdminHeader title="Recebimento dos planos" description="Conta PJ que recebe as mensalidades do Del Flash." />
    <Panel title="InfinitePay">
      <p>InfiniteTag da plataforma {handle && <strong>{'$'}{handle}</strong>}</p>
      <p>{encryptedKey ? 'Checkout validado para Pix e crédito.' : 'Ative o Checkout Integrado na InfinitePay e salve a API Key desta conta PJ.'}</p>
      <SaasPaymentSetup configured={Boolean(encryptedKey)} />
      <p><a href="https://app.infinitepay.io/" target="_blank" rel="noreferrer">Abrir minha conta InfinitePay</a></p>
    </Panel>
  </>;
}
