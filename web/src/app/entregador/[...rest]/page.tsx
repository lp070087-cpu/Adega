import { notFound } from 'next/navigation';

// Endereços desconhecidos da área do entregador usam o 404 desta área
// (sem atalhos para o painel), não o 404 geral do site.
export default function UnknownDriverPage() {
  notFound();
}
