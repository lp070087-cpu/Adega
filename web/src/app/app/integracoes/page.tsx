import { requireOrgPage } from '@/lib/auth/guards';
import Link from 'next/link';
import { Cable } from 'lucide-react';
export const metadata = { title: 'Integrações' };
export default async function IntegrationsPage() {
  await requireOrgPage();
  return <section className="mx-auto max-w-xl rounded-xl border border-ink-200 bg-white p-8">
    <Cable className="mb-4 h-7 w-7 text-ink-500" aria-hidden="true" />
    <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Integrações administradas pela plataforma</h2>
    <p className="mt-3 text-sm leading-6 text-ink-500">As conexões e seus registros foram preservados. Para configurar um serviço, entre em contato com a administração da plataforma.</p>
    <Link href="/app" className="mt-5 inline-block text-sm font-semibold text-brand">Voltar ao painel</Link>
  </section>;
}
