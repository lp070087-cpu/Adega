import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma, toNumber } from '@/lib/db';
import { formatBRL } from '@/lib/utils';
import { PAYMENT_METHOD_LABEL } from '@/data/business-copy';
import { OrderRefresh } from '@/components/store/OrderRefresh';
import { OrderTracker } from '@/components/orders/OrderTracker';
import { orderTracking } from '@/lib/order-tracking';
import { storeTimeZone } from '@/lib/schedule';
import { portalSession } from '@/lib/customer-portal/server';
import '../../conta/portal.css';

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
    select: {
      displayId: true, status: true, subtotal: true, deliveryFee: true, discount: true, total: true,
      deliveryType: true, paymentMethod: true, paymentStatus: true, changeFor: true,
      deliveryAddress: true, deliveryNumber: true, deliveryDistrict: true, deliveryCity: true,
      createdAt: true, updatedAt: true, acceptedAt: true, preparingAt: true, readyAt: true,
      dispatchedAt: true, deliveredAt: true, cancelledAt: true,
      items: { select: { id: true, productName: true, variationName: true, quantity: true, total: true, options: { select: { name: true, quantity: true } } } },
      delivery: { select: { status: true } },
      driver: { select: { name: true } },
      portalLink: { select: { accountId: true } },
      organization: { select: { name: true, logoUrl: true, brandColor: true, settings: true, averageDeliveryTime: true } },
    },
  });
  if (!order) notFound();
  const store = order.organization, timeZone = storeTimeZone(store.settings);
  const tracking = orderTracking({ ...order, deliveryStatus: order.delivery?.status });
  const pickup = order.deliveryType === 'PICKUP';
  const ownerSession = order.portalLink ? await portalSession(slug).catch(() => null) : null;
  const isOwner = Boolean(ownerSession && ownerSession.id === order.portalLink?.accountId);
  const brand = /^#[0-9a-f]{6}$/i.test(store.brandColor) ? store.brandColor : '#087EA4';
  const dateTime = (value: Date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(value);
  const driverFirstName = !pickup && order.driver?.name && ['DISPATCHED', 'DELIVERED'].includes(order.status) ? order.driver.name.trim().split(/\s+/)[0] : null;
  const address = [order.deliveryAddress && `${order.deliveryAddress}${order.deliveryNumber ? `, ${order.deliveryNumber}` : ''}`, order.deliveryDistrict, order.deliveryCity].filter(Boolean).join(' · ');
  const history = [
    { label: 'Pedido recebido', at: order.createdAt },
    { label: 'Aceito pela loja', at: order.acceptedAt },
    { label: 'Separação iniciada', at: order.preparingAt },
    ...(pickup ? [{ label: 'Pronto para retirada', at: order.readyAt }] : [{ label: 'Saiu para entrega', at: order.dispatchedAt }]),
    { label: pickup ? 'Retirada confirmada' : 'Entrega concluída', at: order.deliveredAt },
    { label: 'Pedido cancelado', at: order.cancelledAt },
  ].filter((entry): entry is { label: string; at: Date } => Boolean(entry.at)).sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <main className="customer-shell" style={{ ['--store-accent' as string]: brand }}>
      <div className="customer-wrap customer-track-wrap">
        <header className="customer-header">
          <Link href={`/loja/${slug}/`}>{store.logoUrl ? <img src={store.logoUrl} alt="" /> : <span className="customer-store-tag" aria-hidden />}<span>{store.name}</span></Link>
          {isOwner ? <Link href={`/loja/${slug}/conta/pedidos`}>Meus pedidos</Link> : <Link href={`/loja/${slug}/`}>Voltar à loja</Link>}
        </header>
        <section className="customer-card customer-track-hero" aria-labelledby="track-title">
          <div className="customer-track-top">
            <div><p className="customer-muted">Pedido</p><h1 id="track-title" className="customer-title">#{order.displayId}</h1></div>
            <div className="customer-track-meta"><span>{pickup ? 'Retirada na loja' : 'Entrega'}</span><time dateTime={order.createdAt.toISOString()}>{dateTime(order.createdAt)}</time></div>
          </div>
          <OrderTracker order={{ ...order, deliveryStatus: order.delivery?.status }} timeZone={timeZone} />
          {driverFirstName && <p className="customer-muted">Entregador responsável: <strong>{driverFirstName}</strong></p>}
          {!tracking.terminal && store.averageDeliveryTime > 0 && !pickup && <p className="customer-muted">Tempo médio de entrega informado pela loja: {store.averageDeliveryTime} min. Não é uma previsão exata deste pedido.</p>}
          <OrderRefresh terminal={tracking.terminal} />
        </section>
        <div className="customer-grid">
          <section className="customer-card">
            <h2>Itens</h2>
            <ul className="customer-items">
              {order.items.map((item) => <li key={item.id}><span><strong>{item.quantity}×</strong> {item.productName}{item.variationName ? ` · ${item.variationName}` : ''}{item.options.length > 0 && <small>{item.options.map((option) => `${option.quantity > 1 ? `${option.quantity}× ` : ''}${option.name}`).join(', ')}</small>}</span><span>{formatBRL(toNumber(item.total))}</span></li>)}
            </ul>
            <dl className="customer-totals">
              <div><dt>Subtotal</dt><dd>{formatBRL(toNumber(order.subtotal))}</dd></div>
              {!pickup && <div><dt>Entrega</dt><dd>{toNumber(order.deliveryFee) > 0 ? formatBRL(toNumber(order.deliveryFee)) : 'Grátis'}</dd></div>}
              {toNumber(order.discount) > 0 && <div><dt>Desconto</dt><dd>−{formatBRL(toNumber(order.discount))}</dd></div>}
              <div className="customer-total"><dt>Total</dt><dd>{formatBRL(toNumber(order.total))}</dd></div>
            </dl>
          </section>
          <section className="customer-card">
            <h2>Detalhes</h2>
            <dl className="customer-details">
              <div><dt>Estabelecimento</dt><dd>{store.name}</dd></div>
              <div><dt>Modalidade</dt><dd>{pickup ? 'Retirada no estabelecimento' : 'Entrega no endereço'}</dd></div>
              {!pickup && address && <div><dt>Endereço</dt><dd>{address}</dd></div>}
              <div><dt>Pagamento</dt><dd>{PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}{order.paymentMethod === 'CASH' && order.changeFor ? ` · troco para ${formatBRL(toNumber(order.changeFor))}` : ''}{order.paymentStatus === 'PAID' ? ' · pago' : order.paymentMethod === 'ONLINE' ? ' · aguardando confirmação do pagamento' : ''}</dd></div>
              <div><dt>Status atual</dt><dd>{tracking.headline}</dd></div>
            </dl>
            <h2 className="customer-subhead">Histórico</h2>
            <ol className="customer-history">
              {history.map((entry) => <li key={entry.label}><span>{entry.label}</span><time dateTime={entry.at.toISOString()}>{dateTime(entry.at)}</time></li>)}
            </ol>
          </section>
        </div>
        <p className="customer-muted customer-track-foot">{isOwner ? 'Este pedido também está no histórico da sua conta.' : 'Guarde este link para consultar o pedido. Quem tiver o link consegue ver este acompanhamento.'}</p>
      </div>
    </main>
  );
}
