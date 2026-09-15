import { PrismaClient, BusinessType } from '@prisma/client';
import { GLOBAL_CATEGORY_TREE, GLOBAL_SUBCATEGORIES } from '../src/data/global-catalog';
import {
  GLOBAL_PRODUCT_SEEDS,
  seedImagePath,
  seedSegments,
  seedSlug,
  findDuplicateSlugs,
  type Segment,
} from '../src/data/global-products';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * SEED — BIBLIOTECA GLOBAL DA PLATAFORMA
 * -----------------------------------------------------------------------
 * Popula duas coisas:
 *
 *   1. GlobalCategory — a árvore de categorias do acervo
 *      (bebidas → cervejas, refrigerantes, ...)
 *   2. GlobalProduct  — os produtos que toda loja pode escolher
 *
 * Mais a tabela de junção GlobalProductBusinessType, que diz em quais
 * segmentos cada produto é recomendado.
 *
 * ── IDEMPOTENTE ──
 * Rodar quantas vezes quiser. Tudo casa por chave natural (slug), nunca
 * por id. Nada é apagado: um produto que já existe é ATUALIZADO, não
 * recriado. Produtos que a loja já copiou para o catálogo dela continuam
 * intactos — o vínculo é por globalProductId e não é tocado aqui.
 *
 * ── IMAGENS ──
 * Este seed NÃO baixa nem cria imagem nenhuma. Ele apenas calcula o
 * caminho esperado no acervo (public/catalog/...) e grava em
 * defaultImageUrl. Quando o arquivo real chegar na pasta, ele aparece
 * sozinho — não é preciso rodar nada de novo.
 *
 * Se preferir que o banco fique sem nenhum caminho até o acervo estar
 * pronto, rode com SEED_SKIP_IMAGES=1.
 *
 * Uso:  npm run db:seed
 * ═══════════════════════════════════════════════════════════════════════
 */

const prisma = new PrismaClient();

const SKIP_IMAGES = process.env.SEED_SKIP_IMAGES === '1';

/** Segmento da biblioteca → enum do Prisma. Falha alto se divergirem. */
function toBusinessType(segment: Segment): BusinessType {
  const value = BusinessType[segment as keyof typeof BusinessType];
  if (!value) {
    throw new Error(
      `Segmento "${segment}" existe em src/data/global-products.ts mas não no enum BusinessType do schema. ` +
        'Alinhe os dois antes de rodar o seed.',
    );
  }
  return value;
}

async function seedCategories() {
  let created = 0;
  let updated = 0;

  // ── Raízes ──
  // Duas passadas: primeiro as raízes (para ter o id), depois as folhas
  // (que apontam para o pai). Assim a hierarquia nunca fica pela metade.
  for (const [index, root] of GLOBAL_CATEGORY_TREE.entries()) {
    const existing = await prisma.globalCategory.findUnique({
      where: { slug: root.slug },
      select: { id: true },
    });

    const data = {
      name: root.name,
      slug: root.slug,
      icon: root.icon,
      imagePath: root.path,
      parentId: null,
      position: index,
      active: true,
    };

    if (existing) {
      await prisma.globalCategory.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.globalCategory.create({ data });
      created++;
    }
  }

  // ── Folhas ──
  for (const leaf of GLOBAL_SUBCATEGORIES) {
    const parent = await prisma.globalCategory.findUnique({
      where: { slug: leaf.parentSlug },
      select: { id: true },
    });

    const existing = await prisma.globalCategory.findUnique({
      where: { slug: leaf.slug },
      select: { id: true },
    });

    // A posição reinicia em cada raiz: dentro de "Bebidas" a ordem é
    // 0,1,2..., e dentro de "Alimentos" também. É o que a tela espera.
    const siblings = GLOBAL_SUBCATEGORIES.filter((c) => c.parentSlug === leaf.parentSlug);
    const position = siblings.findIndex((c) => c.slug === leaf.slug);

    const data = {
      name: leaf.name,
      slug: leaf.slug,
      icon: leaf.icon,
      imagePath: leaf.path,
      parentId: parent?.id ?? null,
      position: position < 0 ? 0 : position,
      active: true,
    };

    if (existing) {
      await prisma.globalCategory.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.globalCategory.create({ data });
      created++;
    }
  }

  return { created, updated };
}

async function seedProducts() {
  // Um caminho de imagem repetido faria dois cards mostrarem a mesma foto.
  // Melhor parar aqui do que descobrir isso na vitrine.
  const duplicates = findDuplicateSlugs();
  if (duplicates.length > 0) {
    throw new Error(
      `Produtos com slug repetido na biblioteca: ${duplicates.join(', ')}. ` +
        'Cada produto precisa de nome único (marca + volume costuma bastar).',
    );
  }

  // Categorias por slug, numa consulta só.
  const categories = await prisma.globalCategory.findMany({
    select: { id: true, slug: true },
  });
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  let created = 0;
  let updated = 0;
  const missingCategories = new Set<string>();

  for (const seed of GLOBAL_PRODUCT_SEEDS) {
    const slug = seedSlug(seed);
    const categoryId = categoryIdBySlug.get(seed.c) ?? null;
    if (!categoryId) missingCategories.add(seed.c);

    const data = {
      globalCategoryId: categoryId,
      name: seed.n,
      slug,
      brand: seed.b,
      description: null,
      // Caminho RELATIVO, nunca URL absoluta: trocar de domínio ou plugar
      // uma CDN depois é uma linha de código, não um UPDATE em massa.
      defaultImageUrl: SKIP_IMAGES ? null : seedImagePath(seed),
      emoji: seed.e,
      barcode: null,
      volume: seed.v ?? null,
      unit: seed.u ?? null,
      packSize: seed.k ?? 1,
      suggestedPrice: seed.p ?? null,
      suggestedType: 'SIMPLE' as const,
      aliases: [],
      active: true,
    };

    const existing = await prisma.globalProduct.findUnique({
      where: { slug },
      select: { id: true },
    });

    let productId: string;
    if (existing) {
      await prisma.globalProduct.update({ where: { id: existing.id }, data });
      productId = existing.id;
      updated++;
    } else {
      const product = await prisma.globalProduct.create({ data, select: { id: true } });
      productId = product.id;
      created++;
    }

    // ── Segmentos recomendados ──
    // Apaga e regrava só as linhas DESTE produto: mantém a tabela igual ao
    // arquivo-fonte, sem tocar em nenhum outro produto.
    const segments = seedSegments(seed);
    await prisma.globalProductBusinessType.deleteMany({ where: { globalProductId: productId } });
    await prisma.globalProductBusinessType.createMany({
      data: segments.map((segment, index) => ({
        globalProductId: productId,
        businessType: toBusinessType(segment),
        // A ordem do arquivo vira prioridade: os primeiros segmentos da
        // lista aparecem antes nas sugestões.
        weight: segments.length - index,
      })),
    });
  }

  if (missingCategories.size > 0) {
    // Não é fatal — o produto fica sem categoria e o admin arruma depois.
    // Mas precisa aparecer, senão vira pergunta sem resposta.
    console.warn(
      `\n⚠  Categorias não encontradas para: ${[...missingCategories].join(', ')}. ` +
        'Esses produtos ficaram sem categoria global.',
    );
  }

  return { created, updated };
}

async function main() {
  console.log('\n🌱 Seed — biblioteca global da plataforma\n');

  if (SKIP_IMAGES) {
    console.log('   (SEED_SKIP_IMAGES=1 — nenhum caminho de imagem será gravado)\n');
  }

  const categories = await seedCategories();
  console.log(
    `   Categorias:  ${categories.created} criadas, ${categories.updated} atualizadas`,
  );

  const products = await seedProducts();
  console.log(
    `   Produtos:    ${products.created} criados, ${products.updated} atualizados\n`,
  );

  // Resumo por categoria — ajuda a ver o buraco do acervo de imagens.
  const summary = await prisma.globalCategory.findMany({
    where: { parentId: { not: null } },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: true } },
    },
    orderBy: { position: 'asc' },
  });

  const withProducts = summary.filter((c) => c._count.products > 0);
  if (withProducts.length > 0) {
    console.log('   Biblioteca por categoria:');
    for (const category of withProducts) {
      console.log(`     ${category.name.padEnd(20)} ${category._count.products}`);
    }
    console.log('');
  }

  const total = await prisma.globalProduct.count();
  console.log(`   Total na biblioteca: ${total} produtos`);
  console.log('   Nada foi apagado. Rodar de novo não duplica.\n');
}

main()
  .catch((error) => {
    console.error('\n✖ Seed interrompido:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
