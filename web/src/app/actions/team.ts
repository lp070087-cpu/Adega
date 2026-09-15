'use server';

import { revalidatePath } from 'next/cache';
import type { Role } from '@prisma/client';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { outranks, roleRank } from '@/lib/permissions';
import { teamMemberSchema, updateTeamMemberSchema } from '@/lib/validations/operations';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EQUIPE — um vínculo por pessoa, com papel
 * -----------------------------------------------------------------------
 * Não existe tabela Employee separada: OrganizationUser JÁ é a pessoa
 * dentro da loja. Duplicar criaria dois lugares para dizer o mesmo e a
 * inevitável divergência entre eles.
 *
 * Regra de hierarquia: ninguém mexe em quem está acima. Sem isso, um
 * MANAGER rebaixaria o OWNER e assumiria a loja.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type TeamActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

/**
 * Papéis que um lojista PODE atribuir.
 *
 * PLATFORM_ADMIN fica de fora, e isso é proposital: ele não é um papel de
 * loja, é um papel da plataforma. Sem esta lista, um OWNER poderia criar
 * um PLATFORM_ADMIN pela tela de equipe — a matriz de permissões hoje dá
 * pouco a esse papel, mas quem decide quem é administrador da plataforma
 * não pode ser o próprio lojista. A lista é conferida no servidor: o
 * <select> da tela é só conveniência.
 */
const TENANT_ASSIGNABLE_ROLES: Role[] = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'ATTENDANT',
  'KITCHEN',
  'DISPATCHER',
  'DRIVER',
];

/**
 * A LEITURA da equipe NÃO mora aqui. Ela vive em `@/lib/data/team`
 * (getTeam), com 'server-only'.
 *
 * O motivo é específico e vale registrar: este arquivo é 'use server',
 * então cada export dele vira uma rota POST pública. Uma função de
 * leitura que recebe organizationId por parâmetro — sem sessão — seria
 * um endpoint para ler a equipe de qualquer loja. Escrita é ação, e ação
 * confere permissão; leitura é consulta, e consulta recebe o id já
 * validado pela página.
 */

/**
 * Convida/cria um membro. Se o e-mail já existe como User, apenas cria
 * o vínculo com esta organização — a pessoa passa a enxergar as duas
 * lojas em que trabalha, sem senha duplicada.
 */
export async function createTeamMemberAction(formData: FormData): Promise<TeamActionResult> {
  try {
    const ctx = await requirePermission('MANAGE_TEAM');

    const parsed = teamMemberSchema.safeParse({
      name: formData.get('name'),
      email: String(formData.get('email') ?? '').toLowerCase().trim(),
      phone: formData.get('phone') || undefined,
      role: formData.get('role'),
      password: formData.get('password') || undefined,
      shift: formData.get('shift') || undefined,
    });
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
    }

    const d = parsed.data;

    if (!TENANT_ASSIGNABLE_ROLES.includes(d.role)) {
      return { ok: false, error: 'Papel inválido para esta loja.', field: 'role' };
    }

    if (d.role !== 'OWNER' && roleRank(d.role) >= roleRank(ctx.role) && ctx.role !== 'OWNER') {
      return { ok: false, error: 'Você não pode criar alguém com papel igual ou superior ao seu.' };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: d.email },
      select: { id: true, name: true },
    });

    if (existingUser) {
      const alreadyMember = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id },
        },
        select: { id: true, active: true },
      });

      if (alreadyMember?.active) {
        return { ok: false, error: 'Esta pessoa já faz parte da equipe.', field: 'email' };
      }

      if (alreadyMember) {
        // Vínculo desativado: reativar em vez de criar outro.
        await prisma.organizationUser.update({
          where: { id: alreadyMember.id },
          data: { active: true, role: d.role, shift: d.shift ?? null },
        });
        revalidatePath('/app/equipe');
        return { ok: true };
      }

      await prisma.organizationUser.create({
        data: {
          organizationId: ctx.organizationId,
          userId: existingUser.id,
          role: d.role,
          active: true,
          shift: d.shift ?? null,
          acceptedAt: new Date(),
        },
      });

      revalidatePath('/app/equipe');
      return { ok: true };
    }

    // Usuário novo: só cria com senha. Sem isso a pessoa não conseguiria entrar.
    if (!d.password) {
      return { ok: false, error: 'Informe uma senha inicial para o novo usuário.', field: 'password' };
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: d.name,
          email: d.email,
          phone: d.phone ?? null,
          passwordHash: await hashPassword(d.password!),
          // Entra com senha provisória: o app pede a troca no primeiro acesso.
          mustChangePassword: true,
        },
      });

      await tx.organizationUser.create({
        data: {
          organizationId: ctx.organizationId,
          userId: user.id,
          role: d.role,
          active: true,
          shift: d.shift ?? null,
          acceptedAt: new Date(),
        },
      });
    });

    revalidatePath('/app/equipe');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateTeamMemberAction(input: {
  memberId: string;
  role?: Role;
  active?: boolean;
  shift?: string;
}): Promise<TeamActionResult> {
  try {
    const ctx = await requirePermission('MANAGE_TEAM');

    const parsed = updateTeamMemberSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      return { ok: false, error: issue?.message ?? 'Dados inválidos.' };
    }

    const member = await prisma.organizationUser.findFirst({
      where: { id: parsed.data.memberId, organizationId: ctx.organizationId },
      select: { id: true, role: true, userId: true, organizationId: true },
    });
    if (!member) return { ok: false, error: 'Membro não encontrado.' };

    // Ninguém rebaixa ou desliga quem está acima na hierarquia.
    if (member.role === 'OWNER') {
      return { ok: false, error: 'O proprietário não pode ser alterado por aqui.' };
    }
    if (!outranks(ctx.role, member.role) && ctx.role !== 'OWNER') {
      return { ok: false, error: 'Você não pode alterar alguém de nível igual ou superior.' };
    }
    if (parsed.data.role && !TENANT_ASSIGNABLE_ROLES.includes(parsed.data.role)) {
      return { ok: false, error: 'Papel inválido para esta loja.' };
    }
    if (parsed.data.role && roleRank(parsed.data.role) >= roleRank(ctx.role) && ctx.role !== 'OWNER') {
      return { ok: false, error: 'Você não pode promover alguém ao seu nível ou acima.' };
    }


    // A si mesmo: não dá para se rebaixar nem se desligar.
    if (member.userId === ctx.user.id) {
      if (parsed.data.active === false) {
        return { ok: false, error: 'Você não pode desativar o próprio acesso.' };
      }
      if (parsed.data.role && parsed.data.role !== member.role) {
        return { ok: false, error: 'Você não pode alterar o próprio papel.' };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationUser.update({
        where: { id: member.id },
        data: {
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
          ...(parsed.data.shift !== undefined ? { shift: parsed.data.shift ?? null } : {}),
        },
      });

      // Desligar o vínculo também bloqueia o login.
      if (parsed.data.active === false) {
        await tx.user.update({
          where: { id: member.userId },
          data: { active: false },
        });
      }
    });

    revalidatePath('/app/equipe');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

/** Remove o vínculo com esta loja. Se for o último, desativa o usuário. */
export async function removeTeamMemberAction(memberId: string): Promise<TeamActionResult> {
  try {
    const ctx = await requirePermission('MANAGE_TEAM');

    const member = await prisma.organizationUser.findFirst({
      where: { id: memberId, organizationId: ctx.organizationId },
      select: { id: true, role: true, userId: true },
    });
    if (!member) return { ok: false, error: 'Membro não encontrado.' };
    if (member.role === 'OWNER') {
      return { ok: false, error: 'O proprietário não pode ser removido.' };
    }
    if (member.userId === ctx.user.id) {
      return { ok: false, error: 'Você não pode remover o próprio acesso.' };
    }
    if (!outranks(ctx.role, member.role) && ctx.role !== 'OWNER') {
      return { ok: false, error: 'Você não pode remover alguém de nível igual ou superior.' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationUser.delete({ where: { id: member.id } });

      // Sem nenhum outro vínculo, o login não serve para nada: desativa.
      const remaining = await tx.organizationUser.count({
        where: { userId: member.userId, active: true },
      });
      if (remaining === 0) {
        await tx.user.update({ where: { id: member.userId }, data: { active: false } });
      }
    });

    revalidatePath('/app/equipe');
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}
