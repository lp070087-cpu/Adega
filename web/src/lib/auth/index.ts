import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { verifyPassword, fakeVerify } from './password';
import { authConfig } from './config';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AUTH.JS — login por e-mail e senha
 * -----------------------------------------------------------------------
 * A sessão carrega o organizationId e o role. É essa dupla que define
 * tudo o que o usuário vê — nunca um parâmetro vindo da URL ou do corpo
 * da requisição.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        // Um único campo de identificação: e-mail OU nome de usuário.
        // O painel da loja entra pelo e-mail; o entregador OPÇÃO B entra
        // pelo username. Quem decide qual consulta usar é o conteúdo.
        login: { label: 'E-mail ou nome de usuário', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },

      async authorize(raw) {
        // Validação no servidor: o formulário pode ter sido burlado.
        const login = typeof raw?.login === 'string' ? raw.login.trim().toLowerCase() : '';
        const password = typeof raw?.password === 'string' ? raw.password : '';
        if (!login || !password || password.length > 72) return null;

        // E-mail OU nome de usuário. Os dois são únicos, então a ordem
        // não cria ambiguidade: se não achou por e-mail, tenta username.
        const include = {
          organizations: {
            where: { active: true },
            include: { organization: true },
            // OWNER primeiro: quem tem mais de um vínculo entra na loja
            // que administra, não na que apenas opera.
            orderBy: { createdAt: 'asc' as const },
          },
        };

        const byEmail = await prisma.user.findUnique({ where: { email: login }, include });
        const user =
          byEmail ?? (await prisma.user.findUnique({ where: { username: login }, include }));

        // Mesmo caminho de tempo quando o identificador não existe.
        if (!user) {
          await fakeVerify(password);
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        if (!user.active) return null;

        // Usuário sem organização ainda é válido: ele vai para o onboarding
        // e cria a loja dele. Sem vínculo, organizationId fica null.
        const membership =
          user.organizations.find((m) => m.role === 'OWNER') ?? user.organizations[0];

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email ?? '',
          image: user.image,
          organizationId: membership?.organizationId ?? null,
          role: membership?.role ?? null,
          organizationName: membership?.organization.name ?? null,
          organizationSlug: membership?.organization.slug ?? null,
        };
      },
    }),
  ],
});

/** Usuário logado, ou null. Não lança — use requireUser() quando exigir sessão. */
export async function currentUser() {
  const session = await auth();
  return session?.user ?? null;
}
