/** Read-only: node --env-file=.env --import tsx scripts/store-assets-check.ts <slug> */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { catalogImageCandidates, productImageCandidates } from '../src/lib/catalog-images';
const db = new PrismaClient();
async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error('Informe o slug.');
  const store = await db.organization.findUnique({ where: { slug }, select: { id: true, businessType: true } });
  if (!store) throw new Error('Loja não encontrada.');
  const [own, defaults, products, globals, migrations] = await Promise.all([
    db.storeBanner.findMany({ where: { organizationId: store.id }, select: { imagePath: true, active: true, placement: true } }),
    db.storeBanner.count({ where: { organizationId: null, active: true, placement: 'hero', OR: [{ businessTypes: { isEmpty: true } }, ...(store.businessType ? [{ businessTypes: { has: store.businessType } }] : [])] } }),
    db.product.findMany({ where: { organizationId: store.id }, select: { name: true, customImageUrl: true, imageUrl: true, globalProduct: { select: { defaultImageUrl: true } } } }),
    db.globalProduct.findMany({ select: { defaultImageUrl: true } }),
    db.$queryRaw<Array<{ present: boolean }>>`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`,
  ]);
  function sourceStatus(source: string | null) {
    if (!source) return 'fallback';
    if (/^https?:\/\//i.test(source)) return 'external-not-fetched';
    return catalogImageCandidates(source).some(candidate => candidate.startsWith('/catalog/') && existsSync(path.join(process.cwd(), 'public', candidate))) ? 'local-found' : 'local-missing';
  }
  const summary = (values: string[]) => Object.fromEntries([...new Set(values)].map(key => [key, values.filter(value => value === key).length]));
  const history = migrations[0]?.present
    ? await db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`
    : [];
  console.log(JSON.stringify({
    slug, ownBanners: own.length, activeHeroBanners: own.filter(b => b.active && b.placement === 'hero').length,
    platformBannersForSegment: defaults, prismaMigrationTablePresent: migrations[0]?.present,
    migrationHistory: history,
    products: products.length,
    productImages: summary(products.map(p => {
      const sources = productImageCandidates({ customImageUrl: p.customImageUrl ?? p.imageUrl, globalImageUrl: p.globalProduct?.defaultImageUrl, productName: p.name });
      const statuses = sources.map(sourceStatus);
      return statuses.includes('local-found') ? 'local-found' : statuses.includes('external-not-fetched') ? 'external-not-fetched' : 'fallback';
    })),
    globalImages: summary(globals.map(p => sourceStatus(p.defaultImageUrl))),
    // Não imprimir URLs externas: podem conter assinaturas privadas.
  }, null, 2));
}
main().catch(() => { console.error('Verificação não concluída. Confira conexão, schema e slug; nenhum segredo foi impresso.'); process.exitCode = 1; }).finally(() => db.$disconnect());
