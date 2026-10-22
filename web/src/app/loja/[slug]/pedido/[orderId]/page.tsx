import { operationalLabel } from '@/lib/order-presentation';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma, toNumber } from '@/lib/db';
import { formatBRL } from '@/lib/utils';
import { ORDER_STATUS_LABEL } from '@/data/business-copy';
import { OrderRefresh } from '@/components/store/OrderRefresh';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Acompanhar pedido', robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// The non-sequential order ID is a private capability. Never resolve by displayId.
export default async function TrackOrder({ params }: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  if (!/^c[a-z0-9]{20,40}$/.test(orderId)) notFound();
  const order = await prisma.order.findFirst({
    where: { id: orderId, organization: { slug } },
    select: { displayId: true, status: true, total: true, deliveryType: true,
      updatedAt: true, organization: { select: { name: true } } },
  });
  if (!order) notFound();
  const terminal = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <p className="text-sm text-ink-500">{order.organization.name}</p>
      <h1 className="text-2xl font-bold">Pedido #{order.displayId}</h1>
      <section aria-live="polite" className="space-y-3 rounded-xl border bg-white p-5">
        <p className="text-xl font-semibold">{operationalLabel(order.status,order.deliveryType)}</p>
        <p>Total: {formatBRL(toNumber(order.total))}</p>
        <p>{order.deliveryType === 'PICKUP' ? 'Retirada no estabelecimento' : 'Entrega no endereço informado'}</p>
        <OrderRefresh terminal={terminal} />
      </section>
      <p className="text-sm text-ink-500">Guarde este link para consultar o pedido. Ele permite acessar este acompanhamento.</p>
      <Link className="font-semibold underline" href={`/loja/${slug}`}>Voltar ao cardápio</Link>
    </main>
  );
}