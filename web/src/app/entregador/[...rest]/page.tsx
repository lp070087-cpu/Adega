import { notFound, redirect } from 'next/navigation';
import { driverStoreBySlug, driverStorePath } from '@/lib/data/driver-link';

/**
 * Endereços desconhecidos da área do entregador usam o 404 desta área
 * (sem atalhos para o painel), não o 404 geral do site.
 *
 * Exceção: o formato antigo do link da loja, `/entregador/<loja>/<número>`
 * (e `/entregador/<loja>`), já foi distribuído por WhatsApp. Se a loja
 * existe, encaminha para o link atual `/entregador/loja/<loja>`.
 */
export default async function UnknownDriverPage({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  const [slug, extra] = rest;
  if (slug && rest.length <= 2 && (extra === undefined || /^\d{1,20}$/.test(extra))) {
    const store = await driverStoreBySlug(slug.toLowerCase());
    if (store) redirect(driverStorePath(store.slug));
  }
  notFound();
}
