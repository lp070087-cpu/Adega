import { redirect } from 'next/navigation';
import { requireOrgPage } from '@/lib/auth/guards';
export default async function LegacyStoreSettings() {
  await requireOrgPage('MANAGE_SETTINGS');
  redirect('/app/configuracoes/minha-loja');
}
