import Link from 'next/link';
import type { ReactNode } from 'react';
import { BadgeCheck, MapPinned, MessageCircle, PackageCheck, Route, ShieldCheck, Store, Timer } from 'lucide-react';
import { DeliveryIllustration } from './DeliveryIllustration';
import './auth-shell.css';

type Audience = 'loja' | 'entregador' | 'plataforma';
const PITCH: Record<Audience, { kicker: string; headline: string; points: Array<[typeof Store, string]> }> = {
  loja: { kicker: 'Painel do estabelecimento', headline: 'Pedidos, entregas e vendas em um só lugar.', points: [[PackageCheck, 'Pedidos chegam na hora, sem atualizar a tela'], [Route, 'Entregadores e rotas organizados'], [MessageCircle, 'Atendimento pelo WhatsApp da loja']] },
  entregador: { kicker: 'Aplicativo do entregador', headline: 'Suas entregas do dia, na palma da mão.', points: [[MapPinned, 'Endereço e ponto exato no mapa'], [Route, 'Sequência das paradas que você organiza'], [Timer, 'Histórico e valores a receber']] },
  plataforma: { kicker: 'Administração da plataforma', headline: 'Operação Del Flash com acesso restrito.', points: [[ShieldCheck, 'Acesso só para operadores autorizados'], [BadgeCheck, 'Ações registradas e auditáveis'], [Store, 'Lojas, planos e suporte']] },
};

/**
 * Moldura única das telas de acesso: painel azul com o entregador à esquerda
 * (no celular vira uma faixa compacta no topo) e o cartão do formulário.
 * Cada tela mantém o próprio formulário e a própria regra de sessão.
 */
export function AuthShell({ audience, title, subtitle, children, footer, badge, back }: { audience: Audience; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; badge?: ReactNode; back?: { href: string; label: string } }) {
  const pitch = PITCH[audience];
  return (
    <main className="auth-root" data-audience={audience}>
      <aside className="auth-brand">
        <Link href="/" className="auth-logo" aria-label="Del Flash — início">
          <span className="auth-logo-mark" aria-hidden><svg viewBox="0 0 24 24" width="20" height="20"><path d="M13.5 2 5 13.5h6L9.8 22 19 9.8h-6.2L13.5 2Z" fill="currentColor" /></svg></span>
          <span>Del Flash</span>
        </Link>
        <div className="auth-pitch">
          <p className="auth-kicker">{pitch.kicker}</p>
          <h2>{pitch.headline}</h2>
          <ul>{pitch.points.map(([Icon, text]) => <li key={text}><Icon size={18} aria-hidden />{text}</li>)}</ul>
        </div>
        <DeliveryIllustration className="auth-illustration" />
      </aside>
      <section className="auth-panel">
        {back && <Link href={back.href} className="auth-back">← {back.label}</Link>}
        <div className="auth-card">
          {badge}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
        <p className="auth-legal">Del Flash · conexão protegida</p>
      </section>
    </main>
  );
}
