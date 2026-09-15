import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';

/**
 * Configuração base do Auth.js — compartilhada entre o runtime Node
 * (src/lib/auth/index.ts) e o middleware (edge).
 *
 * O middleware roda no edge runtime, onde Prisma não funciona. Por isso
 * aqui NÃO há acesso a banco: só a definição das páginas e os callbacks
 * de sessão, que leem o que já está dentro do JWT.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    updateAge: 60 * 60, // renova o token de hora em hora
  },

  trustHost: true,

  providers: [], // preenchidos em src/lib/auth/index.ts (Credentials exige Prisma)

  callbacks: {
    /**
     * Copia id/organizationId/role para o token. O `user` só existe no
     * primeiro login; depois disso o token já carrega tudo.
     */
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id;
        token.organizationId = (user as { organizationId?: string }).organizationId;
        token.role = (user as { role?: Role }).role;
        token.organizationName = (user as { organizationName?: string }).organizationName;
        token.organizationSlug = (user as { organizationSlug?: string }).organizationSlug;
      }
      /**
       * NÃO aceitar organizationId/role vindos de `trigger === 'update'`.
       *
       * Existia aqui um trecho que copiava esses campos da sessão para o
       * token quando o app chamava updateSession(). O problema: esse caminho
       * é acionável do NAVEGADOR. Qualquer usuário logado podia pedir
       * `update({ organizationId: '<id de outra loja>', role: 'OWNER' })` e
       * gravar o que quisesse dentro do próprio JWT.
       *
       * Não era furo de autorização — requireOrg() reconsulta o vínculo em
       * `organizationUser` e tira papel e organização DA LINHA, não do token
       * (ver resolveMembership em guards.ts). Mas os campos do token
       * alimentam a interface (nome e slug da loja no cabeçalho, rótulos de
       * papel), então eram dados forjáveis na tela.
       *
       * Quem acabou de criar a loja continua funcionando: o token sem
       * organizationId cai no fallback de resolveMembership, que lê o
       * vínculo real do usuário no banco.
       */
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.userId as string) ?? '';
        session.user.organizationId = (token.organizationId as string | null) ?? null;
        session.user.role = (token.role as Role | null) ?? null;
        session.user.organizationName = (token.organizationName as string | null) ?? null;
        session.user.organizationSlug = (token.organizationSlug as string | null) ?? null;
      }
      return session;
    },

    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      // Área da plataforma exige sessão. /entregador fica fora do matcher
      // (ver src/middleware.ts): a página do entregador mostra o próprio
      // formulário de login quando não há sessão.
      if (pathname.startsWith('/app')) {
        return isLoggedIn;
      }
      // Onboarding idem (o usuário já existe, falta configurar a loja).
      if (pathname.startsWith('/onboarding')) {
        return isLoggedIn;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
