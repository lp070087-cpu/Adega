import type { Metadata } from 'next';
import { InstallApp } from '@/components/pwa/InstallApp';
import { storeAppPath } from '@/lib/pwa';

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
  return <>{children}<div className="mx-auto max-w-6xl px-4 pb-24"><InstallApp name="Loja" worker={`${path}/sw.js`} scope={`${path}/`} /></div></>;
}
