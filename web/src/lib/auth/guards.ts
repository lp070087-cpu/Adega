import 'server-only';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';
import { auth } from './index';
import { prisma } from '@/lib/db';
import { can, type Permission } from '@/lib/permissions';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GUARDS — a fronteira de segurança do multi-tenant
 * -----------------------------------------------------------------------
 * REGRA ABSOLUTA: nenhuma query operacional roda sem passar por aqui.
 *
 * O organizationId vem SEMPRE da sessão assinada (JWT), nunca de:
 *   • parâmetro de URL (?loja=...)     → falsificável
 *   • campo no corpo da requisição      → falsificável
 *   • header                            → falsificável
 *   • localStorage                      → fica no navegador do cliente
 *
 * Se este arquivo estiver correto, uma empresa não consegue ler nem
 * escrever dados de outra, mesmo adulando a URL.
 * ═══════════════════════════════════════════════════════════════════════
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'NO_ORGANIZATION'
      | 'FORBIDDEN'
      | 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  role: Role;
};

export type OrganizationContext = {
  user: SessionUser;
  organizationId: string;
  role: Role;
};

/**
 * Vínculo ATIVO do usuário, lido do BANCO — com o id do token como
 * preferência, não como verdade.
 *
 * POR QUE ISTO EXISTE: o JWT é gravado no login e só muda quando alguém
 * chama updateSession(). Quem acabou de criar a loja no onboarding tem um
 * token SEM organizationId, e ficaria num vaivém entre /app e /onboarding
 * até o token expirar. Acontecia de verdade.
 *
 * POR QUE ISTO NÃO É "pegar a primeira loja do banco": a consulta do passo
 * 2 é filtrada pelo userId DA SESSÃO. Ela só pode devolver um vínculo do
 * próprio usuário — nenhuma loja de terceiro é alcançável por aqui. A
 * diferença entre "primeira organização da tabela" e "primeira organização
 * DESTE usuário" é a diferença entre um vazamento e um login.
 *
 * `revoked` separa dois casos que exigem respostas diferentes: o vínculo
 * foi desligado (FORBIDDEN, a pessoa precisa falar com o dono) e o vínculo
 * nunca existiu (NO_ORGANIZATION, a pessoa vai para o onboarding).
 */
async function resolveMembership(
  userId: string,
  tokenOrganizationId?: string | null,
): Promise<
  | { organizationId: string; role: Role; revoked: false }
  | { organizationId: null; role: null; revoked: boolean }
> {
  if (tokenOrganizationId) {
    const exact = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId: tokenOrganizationId, userId },
      },
      select: { organizationId: true, role: true, active: true },
    });

    if (exact?.active) {
      return { organizationId: exact.organizationId, role: exact.role, revoked: false };
    }
    if (exact && !exact.active) {
      return { organizationId: null, role: null, revoked: true };
    }
  }

  // O token não aponta para lugar nenhum válido. O vínculo real do usuário
  // é o que vale — e ele é único na prática: quem cria a loja é OWNER dela.
  const own = await prisma.organizationUser.findFirst({
    where: { userId, active: true },
    select: { organizationId: true, role: true },
    orderBy: { createdAt: 'asc' },
  });

  if (own) {
    return { organizationId: own.organizationId, role: own.role, revoked: false };
  }

  return { organizationId: null, role: null, revoked: false };
}

/**
 * Sessão + organização, obrigatórias.
 *
 * Uso:
 *   const { organizationId, role, user } = await requireOrg();
 *   await prisma.product.findMany({ where: { organizationId } });
 *
 * O `where` por organizationId é obrigatório. Toda função de dados
 * recebe organizationId como primeiro parâmetro por causa disso.
 */
export async function requireOrg(): Promise<OrganizationContext> {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) {
    throw new AuthError('Sessão expirada. Entre novamente.', 'UNAUTHENTICATED');
  }

  // O vínculo vem do banco (ver resolveMembership). O papel usado adiante
  // é o ATUAL, não o do token: desativar alguém tem efeito imediato.
  const membership = await resolveMembership(user.id, user.organizationId);

  if (membership.revoked) {
    throw new AuthError(
      'Seu acesso a este estabelecimento foi removido.',
      'FORBIDDEN',
    );
  }

  if (!membership.organizationId || !membership.role) {
    throw new AuthError(
      'Sua conta ainda não está vinculada a um estabelecimento.',
      'NO_ORGANIZATION',
    );
  }

  return {
    user: {
      id: user.id,
      name: user.name ?? '',
      email: user.email ?? '',
      organizationId: membership.organizationId,
      role: membership.role,
    },
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

/**
 * Exige uma permissão específica. Combina a checagem de vínculo
 * (requireOrg) com a matriz de papéis (can).
 */
export async function requirePermission(
  permission: Permission,
): Promise<OrganizationContext> {
  const ctx = await requireOrg();
  if (!can(ctx.role, permission)) {
    throw new AuthError(
      'Seu perfil não tem permissão para esta ação.',
      'FORBIDDEN',
    );
  }
  return ctx;
}

/**
 * Contexto para Server Components: em vez de lançar (o que mostraria
 * erro genérico), redireciona para o destino correto.
 *
 *   • sem sessão         → /login
 *   • sem organização    → /onboarding
 *   • sem permissão      → /app (com aviso)
 */
export async function requireOrgPage(permission?: Permission): Promise<OrganizationContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  // A checagem de vínculo fica TODA no catch, via requireOrg. Antes havia
  // aqui um `if (!session.user.organizationId) redirect('/onboarding')` —
  // e era ele que fechava o laço: o token recém-criado não tem
  // organizationId, então o painel devolvia para o onboarding mesmo com a
  // loja já gravada no banco.
  try {
    const ctx = permission
      ? await requirePermission(permission)
      : await requireOrg();
    return ctx;
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === 'UNAUTHENTICATED') redirect('/login');
      if (error.code === 'NO_ORGANIZATION') redirect('/onboarding');
      // Sem permissão: volta para o dashboard em vez de tela de erro.
      redirect('/app?semPermissao=1');
    }
    throw error;
  }
}

/** Dados da organização da sessão — para header, sidebar e títulos. */
export async function getCurrentOrganization() {
  const { organizationId } = await requireOrg();
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!organization) {
    // Organização apagada com o usuário ainda logado.
    throw new AuthError('Estabelecimento não encontrado.', 'NOT_FOUND');
  }
  return organization;
}

/** Onboarding: usuário logado, ainda SEM estabelecimento. */
export async function requireOnboardingUser() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  // Quem já tem loja não volta para o onboarding. A pergunta é feita ao
  // BANCO, não ao token: logo após criar a loja o JWT ainda está velho, e
  // confiar nele mandaria o lojista recomeçar o cadastro — ou pior, criar
  // uma segunda loja.
  const membership = await resolveMembership(session.user.id, session.user.organizationId);
  if (membership.organizationId) redirect('/app');

  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
  };
}

/** App do entregador: sessão com papel DRIVER. */
export async function requireDriver() {
  const ctx = await requireOrg();
  if (ctx.role !== 'DRIVER' && !can(ctx.role, 'MANAGE_DRIVERS')) {
    throw new AuthError(
      'Esta área é exclusiva para entregadores.',
      'FORBIDDEN',
    );
  }

  // O registro de Driver é o que amarra o login ao entregador. Sem ele,
  // não há como saber quais pedidos são "dele".
  const driver = await prisma.driver.findFirst({
    where: { organizationId: ctx.organizationId, userId: ctx.user.id, active: true },
  });

  if (!driver) {
    throw new AuthError(
      'Seu usuário não está vinculado a um cadastro de entregador.',
      'FORBIDDEN',
    );
  }

  return { ...ctx, driver };
}

/** Erros de guard viram resposta de server action em vez de stack trace. */
export function toActionError(error: unknown): { error: string } {
  if (error instanceof AuthError) return { error: error.message };
  if (error instanceof Error) return { error: error.message };
  return { error: 'Não foi possível concluir a operação.' };
}
