import NextAuth, { type NextAuthRequest } from 'next-auth';
import { authConfig } from '@/lib/auth/config';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { canonicalAppPath, requiresSessionMiddleware } from '@/lib/pwa-paths';

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
const authenticatedMiddleware = NextAuth(authConfig).auth(
  (_request: NextAuthRequest, _event: NextFetchEvent) => NextResponse.next(),
);
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const canonical = canonicalAppPath(request.nextUrl.pathname);
  if (canonical) {
    // NextURL serializes using Next's trailingSlash=false setting and would
    // remove this slash again, causing a redirect back to the same URL.
    const url = new URL(request.url);
    url.pathname = canonical;
    return NextResponse.redirect(url, 308);
  }
  if (requiresSessionMiddleware(request.nextUrl.pathname)) return authenticatedMiddleware(request, event);
  return NextResponse.next();
}

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
   * As demais páginas recebem apenas a normalização de URL; não passam
   * pelo Auth.js. API e arquivos internos do Next não são interceptados.
   */
  matcher: ['/((?!api/|_next/|favicon.ico).*)'],
};
