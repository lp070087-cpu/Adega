import type { Metadata } from 'next';
import { InstallApp } from '@/components/pwa/InstallApp';
import { storeAppPath } from '@/lib/pwa';
import Link from 'next/link';

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { slug } = await params;
  let path: string;
  try { path = storeAppPath(slug); } catch { return {}; }
  return {
    manifest: `${path}/manifest.webmanifest`,
    icons: { apple: '/pwa/customer-192.png', icon: '/pwa/customer-192.png' },
    appleWebApp: { capable: true, statusBarStyle: 'default' },
  };
}
export default async function StoreLayout({ children, params }: Props) {
  const { slug } = await params;
  let path: string;
  try { path = storeAppPath(slug); } catch { return children; }
  return <>{children}<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pb-24 pt-4 [&>*]:min-w-0"><InstallApp name="Del Flash Loja" worker={`${path}/sw.js`} scope={`${path}/`} /><Link className="inline-flex min-h-11 items-center text-sm text-ink-500" href={`${path}/configuracoes`}>Configurações do aplicativo</Link></div></>;
}
