import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIDDLEWARE
 * -----------------------------------------------------------------------
 * ATENÇÃO AO LUGAR DESTE ARQUIVO. O projeto usa o diretório `src/`, e
 * nesse modo o Next procura o middleware em `src/middleware.ts`. Um
 * arquivo na raiz de `web/` é ignorado em silêncio — sem erro, sem aviso:
 * o matcher simplesmente nunca roda. Já aconteceu aqui, e é por isso que
 * o comentário existe.
 *
 * O middleware roda no edge: aqui só dá para ler o JWT, não o banco. Ele
 * bloqueia quem não está logado; a autorização fina (papel, vínculo com a
 * organização) é feita no servidor por requireOrg()/requirePermission().
 *
 * Controle no middleware é conveniência de navegação, não fronteira de
 * segurança — a fronteira está nos server actions e nas queries.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default NextAuth(authConfig).auth;

export const config = {
  /**
   * Protege /app e /onboarding.
   *
   * /entregador fica FORA do matcher de propósito: quem não está logado
   * precisa ver a tela de login da Área do Entregador (e-mail OU nome de
   * usuário), não ser jogado no /login do painel. A própria página decide
   * entre mostrar o formulário ou o app — a autorização fina continua no
   * servidor, via requireDriver().
   *
   * Fora do matcher também: /loja (pública), /login, /cadastro e assets.
   */
  matcher: ['/app/:path*', '/onboarding/:path*'],
};
