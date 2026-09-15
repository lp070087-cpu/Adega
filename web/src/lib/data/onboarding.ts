import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { slugExists } from './organization';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — rascunho e endereço público
 * -----------------------------------------------------------------------
 * Duas responsabilidades, e só essas:
 *
 *   1. RASCUNHO (passo 3.19). O lojista fecha o navegador no passo 6 e
 *      volta no dia seguinte. Sem isto, ele recomeça do zero — e o motivo
 *      mais provável de abandonar um cadastro de 10 passos é justamente
 *      ter perdido o que já tinha digitado.
 *
 *      O rascunho vive em User.onboardingDraft, NÃO em Organization. O
 *      onboarding roda antes de a loja existir; criá-la no primeiro passo
 *      deixaria lojas órfãs no banco a cada desistência.
 *
 *   2. SLUG. O endereço público (/loja/[slug]) precisa ser único. A tela
 *      mostra a prévia, mas quem decide é o servidor: a checagem aqui é
 *      a que vale, e ela roda de novo dentro da transação de criação.
 *
 * Nada aqui é dado operacional. Nenhuma tela do painel lê o rascunho
 * depois que a loja existe — `clearOnboardingDraft` apaga no fim.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OnboardingDraftState = {
  step: number;
  draft: Record<string, unknown>;
  updatedAt: string;
};

/** Rascunho do usuário. null = nunca começou. */
export async function getOnboardingDraft(userId: string): Promise<OnboardingDraftState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingDraft: true, onboardingStep: true, updatedAt: true },
  });

  if (!user?.onboardingDraft) return null;

  const draft = user.onboardingDraft;
  if (typeof draft !== 'object' || Array.isArray(draft)) return null;

  return {
    step: user.onboardingStep,
    draft: draft as Record<string, unknown>,
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Grava o rascunho. `where: { id: userId }` amarra ao próprio usuário —
 * não existe forma de esta função escrever no rascunho de outra pessoa,
 * porque o id não vem do cliente.
 */
export async function saveOnboardingDraft(
  userId: string,
  step: number,
  draft: Record<string, unknown>,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingDraft: draft as object,
      onboardingStep: Math.min(10, Math.max(1, Math.round(step))),
    },
  });
}

/**
 * Apaga o rascunho. Chamado quando a loja é criada.
 *
 * A ordem importa: se ficasse para depois e a transação falhasse, o
 * lojista voltaria ao onboarding com a loja já criada — e `requireOnboardingUser`
 * o mandaria para o painel, deixando o rascunho pendurado para sempre.
 */
export async function clearOnboardingDraft(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingDraft: Prisma.DbNull, onboardingStep: 1 },
  });
}

// A regra "este slug está livre?" NÃO é redefinida aqui: vem de
// ./organization, que já a usava para renomear loja. Duas funções com a
// mesma regra divergem no dia em que uma mudar — e a que decide o
// endereço público é justamente a que não pode divergir.

/**
 * Endereço público livre a partir de um nome.
 *
 * "Burger do Zé" → burger-do-ze. Se ocupado, tenta -2, -3… até 99 e, no
 * caso improvável de todos estarem tomados, acrescenta um sufixo
 * aleatório. O laço é limitado de propósito: cem consultas é o teto, e
 * um `while(true)` aqui seria uma consulta infinita esperando acontecer.
 */
export async function resolveAvailableSlug(
  desired: string,
  exceptOrganizationId?: string,
): Promise<string> {
  const base = slugify(desired) || 'loja';

  if (!(await slugExists(base, exceptOrganizationId))) return base;

  for (let attempt = 2; attempt < 100; attempt++) {
    const candidate = `${base}-${attempt}`;
    if (!(await slugExists(candidate, exceptOrganizationId))) return candidate;
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Verificação exposta para o passo 3.5 (prévia do endereço). */
export async function checkSlugAvailability(
  desired: string,
): Promise<{ slug: string; available: boolean }> {
  const slug = slugify(desired) || 'loja';
  const taken = await slugExists(slug);
  return { slug, available: !taken };
}

// ── AGENDA SEMANAL ─────────────────────────────────────────────────────

/**
 * A agenda (tipos, resumo legível e padrão sugerido) mora em `@/lib/schedule`,
 * e NÃO aqui. O motivo é prático: a tela do onboarding é um componente
 * cliente, e este arquivo é 'server-only' — importar `defaultSchedule` daqui
 * quebraria o build. Reexportamos os tipos para quem já os procura neste
 * módulo continuar funcionando, sem manter uma segunda implementação.
 */
export type { OpeningPeriod, WeekdaySchedule } from '@/lib/schedule';
export { summarizeSchedule, defaultSchedule, normalizeSchedule } from '@/lib/schedule';





