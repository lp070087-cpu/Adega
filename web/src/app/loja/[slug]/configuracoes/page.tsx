import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicStoreBySlug } from '@/lib/data/organization';
import { storeAppPath } from '@/lib/pwa';
import { InstallApp } from '@/components/pwa/InstallApp';
export default async function CustomerAppSettings({params}:{params:Promise<{slug:string}>}) {
  const {slug} = await params;
  const store = await getPublicStoreBySlug(slug);
  if (!store || store.status === 'CANCELLED') notFound();
  const path = storeAppPath(slug);
  return <main className="mx-auto min-h-screen max-w-xl space-y-5 px-4 py-8"><Link href={`${path}/`} className="inline-flex min-h-11 items-center text-brand">Voltar para {store.name}</Link><h1 className="text-2xl font-bold text-[#0B1F3A]">Configurações do aplicativo</h1><p className="text-sm text-ink-600">{store.name} · Del Flash Loja</p><InstallApp name="Del Flash Loja" worker={`${path}/sw.js`} scope={`${path}/`} alwaysShow/></main>;
}
