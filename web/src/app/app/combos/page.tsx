import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getCategories } from '@/lib/data/catalog';
import { getComboCandidates, getCombos } from '@/lib/data/combos';
import { getOrganizationById } from '@/lib/data/organization';
import { templateLabel } from '@/data/business-templates';
import { ComboManager } from '@/components/catalog/ComboManager';
import type { ComboCandidate, ComboRow } from '@/components/catalog/ComboManager';
import type { BusinessType } from '@prisma/client';

export const metadata = { title: 'Combos' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * COMBOS
 * -----------------------------------------------------------------------
 * Tudo sai de `ctx.organizationId` (sessão). As duas consultas que
 * alimentam a tela — combos e candidatos — já vêm filtradas por
 * organização na camada de dados; a página não filtra nada por conta
 * própria, e é assim que deve ser: filtro na tela é filtro esquecido.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function CombosPage() {
  const ctx = await requireOrgPage('MANAGE_PRODUCTS');

  const [organization, combosRaw, candidatesRaw, categoriesRaw] = await Promise.all([
    getOrganizationById(ctx.organizationId),
    getCombos(ctx.organizationId),
    getComboCandidates(ctx.organizationId),
    getCategories(ctx.organizationId, true),
  ]);

  const businessType = (organization?.businessType ?? 'SNACK_BAR') as BusinessType;

  const combos: ComboRow[] = combosRaw.map((combo) => ({
    id: combo.id,
    name: combo.name,
    emoji: combo.emoji,
    customImageUrl: combo.customImageUrl,
    globalImageUrl: combo.globalImageUrl,
    price: combo.price,
    promotionalPrice: combo.promotionalPrice,
    active: combo.active,
    available: combo.available,
    featured: combo.featured,
    categoryId: combo.categoryId,
    separateTotal: combo.separateTotal,
    items: combo.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      emoji: item.emoji,
      quantity: item.quantity,
    })),
  }));

  const candidates: ComboCandidate[] = candidatesRaw.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    emoji: candidate.emoji,
    price: Number(candidate.price),
    categoryId: candidate.categoryId,
  }));

  const categories = categoriesRaw.map((category) => ({
    id: category.id,
    name: category.name,
    emoji: category.emoji,
  }));

  return (
    <ComboManager
      combos={combos}
      candidates={candidates}
      categories={categories}
      businessTypeLabel={templateLabel(businessType)}
      canManage={can(ctx.role, 'MANAGE_PRODUCTS')}
    />
  );
}
