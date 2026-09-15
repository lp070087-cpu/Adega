import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Entregas',
  description: 'Pedidos atribuídos, rota e confirmação de entrega.',
  // O app do entregador é instalável e não deve ser indexado: o conteúdo
  // é de uma pessoa só, não do site.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Trava o zoom: o app é usado com o celular na mão, na rua.
  maximumScale: 1,
  themeColor: '#F15A24',
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LAYOUT DO APP DO ENTREGADOR
 * -----------------------------------------------------------------------
 * Sem sidebar e sem menu do painel: o entregador tem uma tarefa por vez.
 * O shell é deliberadamente outra coisa — o painel é mesa, isto é rua.
 *
 * O metadata do manifest está no layout raiz (`manifest: /manifest.webmanifest`),
 * então a instalação na tela inicial vale para o app inteiro.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-50">{children}</div>;
}
