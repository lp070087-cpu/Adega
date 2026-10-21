import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  icons: { apple: '/driver-icon-192.png', icon: '/driver-icon-192.png' },
  title: 'Entregas',
  description: 'Pedidos atribuídos, rota e confirmação de entrega.',
  appleWebApp: { capable: true, title: 'Entregador', statusBarStyle: 'default' },
  // O app do entregador é instalável e não deve ser indexado: o conteúdo
  // é de uma pessoa só, não do site.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F15A24',
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYOUT DO APP DO ENTREGADOR
 * -----------------------------------------------------------------------
 * Sem sidebar e sem menu do painel: o entregador tem uma tarefa por vez.
 * O shell é deliberadamente outra coisa — o painel é mesa, isto é rua.
 *
 * O manifest pertence exclusivamente à área do entregador. Painel e loja
 * possuem identidades de instalação independentes.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-50">{children}</div>;
}
