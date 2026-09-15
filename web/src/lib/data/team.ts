import 'server-only';
import { prisma } from '@/lib/db';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EQUIPE — leitura
 * -----------------------------------------------------------------------
 * POR QUE ISTO NÃO MORA EM actions/team.ts
 *
 * Um arquivo marcado com 'use server' transforma CADA export numa rota
 * POST pública. Enquanto getTeam morava lá, qualquer pessoa logada podia
 * chamá-la passando o organizationId de OUTRA loja e receber nomes,
 * e-mails e telefones da equipe alheia — a função confiava no parâmetro.
 *
 * Aqui, com 'server-only', a função não é exportável para o cliente: só
 * código de servidor a alcança. E quem a chama é a página, que já passou
 * por requireOrgPage('MANAGE_TEAM'). O organizationId continua sendo o
 * primeiro parâmetro, como em todo o resto de src/lib/data.
 *
 * A regra geral que fica: leitura vive em src/lib/data, escrita vive em
 * src/app/actions, e nenhuma das duas confia em id vindo do navegador.
 * ═══════════════════════════════════════════════════════════════════════
 */
export async function getTeam(organizationId: string) {
  const members = await prisma.organizationUser.findMany({
    where: { organizationId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, lastLoginAt: true, active: true },
      },
    },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    // E-mail agora é opcional no modelo (entregador OPÇÃO B entra por
    // username). Quem não tem e-mail aparece vazio na lista da equipe.
    email: m.user.email ?? '',
    phone: m.user.phone,
    role: m.role,
    active: m.active && m.user.active,
    shift: m.shift,
    lastLoginAt: m.user.lastLoginAt,
    createdAt: m.createdAt,
  }));
}

export type TeamMember = Awaited<ReturnType<typeof getTeam>>[number];
