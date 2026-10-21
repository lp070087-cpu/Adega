import { notFound } from 'next/navigation';
import { DriverInvitationForm } from '@/components/driver/DriverInvitationForm';
import { getDriverInvitationStore } from '@/lib/auth/driver-invitation';
import { driverMailReady } from '@/lib/auth/driver-access';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Convite de entregador', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function DriverInvitationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDriverInvitationStore(slug);
  if (!store) notFound();
  return <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4"><section className="w-full min-w-0 max-w-md rounded-xl bg-white p-5 shadow-sm sm:p-8"><DriverInvitationForm slug={slug} storeName={store.name} mailReady={driverMailReady()}/></section></main>;
}
