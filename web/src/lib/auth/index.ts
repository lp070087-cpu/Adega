import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import { verifyPassword, fakeVerify } from './password';
import { authConfig } from './config';
import {isPlatformIdentity} from '@/lib/platform/identity';

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
        driverOnly: {label:'Área do entregador',type:'text'},
        remember: {label:'Manter conectado',type:'text'},
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

        if(raw?.driverOnly==='true'&&(!user.passwordHash||user.mustChangePassword)){await fakeVerify(password);return null;}
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        if (!user.active) return null;

        // Usuário sem organização ainda é válido: ele vai para o onboarding
        // e cria a loja dele. Sem vínculo, organizationId fica null.
        const driverOnly=raw?.driverOnly==='true';
        const membership = driverOnly ? user.organizations.find(m=>m.role==='DRIVER') :
          user.organizations.find((m) => m.role === 'OWNER') ?? user.organizations[0];
        const pendingApplicant=!membership&&process.env.DRIVER_APPLICATIONS_ENABLED==='true'&&await (await import('@/lib/data/driver-applications')).driverApplicationsReady()&&Boolean(await prisma.driverApplication.findFirst({where:{userId:user.id},select:{id:true}}));
        if(driverOnly&&(user.organizations.some(m=>m.role!=='DRIVER')||(!pendingApplicant&&(!membership||!await prisma.driver.findFirst({where:{userId:user.id,organizationId:membership.organizationId,active:true},select:{id:true}})))))return null;
        const platformIdentity=membership?.role==='DRIVER'?await isPlatformIdentity(prisma,user.id):false;
        if(driverOnly&&(platformIdentity||await isPlatformIdentity(prisma,user.id)))return null;
        if(membership?.role==='DRIVER'&&!platformIdentity&&user.mustChangePassword)return null;

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
          role: membership?.role ?? (pendingApplicant?'DRIVER':null),
          organizationName: membership?.organization.name ?? null,
          organizationSlug: membership?.organization.slug ?? null,
          ...((membership?.role==='DRIVER'||pendingApplicant)&&!platformIdentity?{driverSessionStartedAt:Date.now(),driverSessionUntil:Date.now()+(raw?.remember==='true'?7*24:8)*60*60*1000}:{}),
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
