import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Layout raiz. O nome do produto é neutro de propósito: a marca que
 * aparece para o lojista é a dele, não a nossa.
 */
/**
 * Origem pública do site.
 *
 * Serve para que `canonical` e `openGraph.url` das páginas de loja saiam
 * ABSOLUTOS — o protocolo de Open Graph exige URL completa, e um caminho
 * relativo não é resolvido por quem lê o card (WhatsApp, Instagram).
 *
 * Lida nesta ordem: variável explícita, URL da Vercel (preview e produção),
 * e por fim localhost — o único caso em que um endereço local é a resposta
 * honesta, porque ainda não existe domínio.
 */
function siteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel?.trim()) return `https://${vercel.trim().replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: 'Delivery Platform',
    template: '%s · Delivery Platform',
  },
  description:
    'Plataforma de gestão de pedidos, catálogo, entregas e caixa para estabelecimentos de delivery.',
  applicationName: 'Delivery Platform',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F15A24',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
