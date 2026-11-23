import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { slugify } from '../src/lib/utils';
import { CATALOG_PHOTOS } from '../src/lib/catalog-photo-manifest';
import * as libraryPolicy from '../src/lib/beverage-library';
import { stockDefaults } from '../src/lib/stock-policy';

test('beverage library saves a tenant selection as zero-stock drafts and can retry without duplication', async () => {
  const organizationId = 'store';
  const category = { name: 'Cervejas', icon: null };
  const globals = [
    { id: 'global-a', name: 'Bebida A', slug: 'bebida-a', active: true, globalCategory: category, suggestedPrice: 12, suggestedType: 'SIMPLE', defaultImageUrl: 'bebidas/a' },
    { id: 'global-b', name: 'Bebida B', slug: 'bebida-b', active: true, globalCategory: category, suggestedPrice: 10, suggestedType: 'SIMPLE', defaultImageUrl: 'bebidas/b' },
  ];
  const stored: Array<Record<string, unknown>> = [];
  const categories: Array<{ id: string; name: string; slug: string; position: number }> = [];
  const tx = {
    organization: { findUniqueOrThrow: async () => ({ settings: { inventoryDefaults: { initialStock: 40, minimumStock: 3 } } }) },
    globalProduct: { findMany: async ({ where, select }: any) => {
      assert.deepEqual(where.businessTypes.some.businessType.in, ['BEVERAGE', 'CONVENIENCE']);
      if (select) {
        assert.equal(select.products.where.organizationId, organizationId);
        return globals.map((product) => ({ ...product, products: stored.filter((item) => item.globalProductId === product.id) }));
      }
      return globals.filter(({ id }) => where.id.in.includes(id));
    } },
    product: {
      findMany: async ({ where }: any) => {
        assert.equal(where.organizationId, organizationId);
        return where.globalProductId ? stored.filter((item) => where.globalProductId.in.includes(item.globalProductId)) : stored;
      },
      createMany: async ({ data }: any) => {
        stored.push(...data);
        return { count: data.length };
      },
    },
    category: {
      findMany: async () => categories,
      createManyAndReturn: async ({ data }: any) => {
        const created = data.map((row: any, index: number) => ({ ...row, id: String(index) }));
        categories.push(...created);
        return created;
      },
    },
  };

  const imports: Record<string, unknown> = {
    'server-only': {},
    '@/lib/beverage-library': libraryPolicy,
    '@/lib/catalog-photo-manifest': { CATALOG_PHOTOS },
    '@/lib/stock-policy': { stockDefaults },
    '@/lib/utils': { slugify },
    '@/lib/db': { prisma: tx, toNumber: (value: unknown) => Number(value ?? 0) },
    '@/lib/data/transaction': { withOrganizationTransaction: (id: string, work: (client: typeof tx) => unknown) => {
      assert.equal(id, organizationId);
      return work(tx);
    } },
  };
  const source = ts.transpileModule(readFileSync('src/lib/data/global-catalog.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as typeof import('../src/lib/data/global-catalog') };
  new Function('require', 'module', 'exports', source)((name: string) => imports[name], module, module.exports);

  const { getBeverageLibrary, addGlobalProductsToStock } = module.exports;
  assert.deepEqual((await getBeverageLibrary(organizationId)).map(({ inStock }) => inStock), [false, false]);
  assert.deepEqual(await addGlobalProductsToStock(organizationId, ['global-a', 'global-a', 'missing']), { created: 1, skipped: 0, unavailable: 1 });
  assert.equal(stored.length, 1);
  assert.deepEqual(stored.map(({ stock, active, available, minimumStock, globalProductId, customImageUrl, price }) =>
    ({ stock, active, available, minimumStock, globalProductId, customImageUrl, price })), [
    { stock: 0, active: false, available: false, minimumStock: 3, globalProductId: 'global-a', customImageUrl: null, price: 12 },
  ]);
  assert.deepEqual(await addGlobalProductsToStock(organizationId, ['global-a', 'global-b']), { created: 1, skipped: 1, unavailable: 0 });
  assert.deepEqual((await getBeverageLibrary(organizationId)).map(({ inStock }) => inStock), [true, true]);
  assert.equal(categories.length, 1);
});

test('store onboarding ignores old draft products and creates an empty stock', async () => {
  const [schemas, schedule, numeric] = await Promise.all([
    import('../src/lib/validations/organization'),
    import('../src/lib/schedule'),
    import('../src/lib/onboarding-number'),
  ]);
  const writes: string[] = [];
  const tx = {
    organization: { create: async () => { writes.push('store'); return { id: 'new-store', slug: 'deposito' }; } },
    organizationUser: { create: async () => { writes.push('owner'); } },
    category: { create: async () => { writes.push('category'); } },
    cashRegister: { create: async () => { writes.push('register'); } },
    plan: { findUnique: async () => null },
  };
  const prisma = {
    user: { findUnique: async () => ({ active: true }) },
    organizationUser: { findFirst: async () => null },
    $transaction: async (work: (client: typeof tx) => unknown) => work(tx),
  };
  const imports: Record<string, unknown> = {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect: (path: string) => { throw new Error(path); } },
    '@/lib/auth': { auth: async () => ({ user: { id: 'owner' } }) },
    '@/lib/auth/guards': { toActionError: (error: Error) => ({ error: error.message }) },
    '@/lib/db': { prisma },
    '@/lib/utils': { slugify },
    '@/lib/onboarding-number': numeric,
    '@/lib/data/onboarding-guard': { lockOnboardingAccount: async () => undefined },
    '@/lib/storage': { validateImageUrl: (url: string) => url },
    '@/lib/data/onboarding': {
      resolveAvailableSlug: async () => 'deposito',
      clearOnboardingDraft: async () => { writes.push('clear-draft'); },
    },
    '@/lib/schedule': schedule,
    '@/lib/validations/organization': schemas,
  };
  const source = ts.transpileModule(readFileSync('src/app/actions/onboarding-v3.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as typeof import('../src/app/actions/onboarding-v3') };
  new Function('require', 'module', 'exports', source)((name: string) => imports[name], module, module.exports);

  const form = new FormData();
  form.set('businessType', 'BEVERAGE');
  form.set('name', 'Depósito');
  form.set('categories', JSON.stringify([{ name: 'Cervejas' }]));
  form.set('schedule', JSON.stringify(schedule.defaultSchedule()));
  form.set('globalProductIds', JSON.stringify(['old-library-selection']));
  form.set('ownProducts', JSON.stringify([{ name: 'Old draft', price: 10 }]));
  assert.deepEqual(await module.exports.completeOnboardingV3Action(undefined, form), { slug: 'deposito', created: 0 });
  assert.deepEqual(writes, ['store', 'owner', 'category', 'register', 'clear-draft']);
});


test('beverage library excludes grocery items and carton juice, keeps ice and distinguishes manufacturers', () => {
  const { isBeverageLibraryItem, beverageManufacturer } = libraryPolicy;
  for (const [slug, category, brand] of [
    ['arroz-tio-joao', 'mercearia', 'Tio João'],
    ['combo-acai-500ml', 'combos', 'Cozinha'],
    ['esfiha-de-carne', 'salgados', 'Cozinha'],
    ['chopp-skol-barril-5l', 'chopp', 'Skol'],
    ['suco-del-valle-uva-1l', 'sucos', 'Del Valle'],
  ]) assert.equal(isBeverageLibraryItem({ slug, brand, globalCategory: { slug: category } }), false);
  for (const [slug, category] of [['gelo-tradicional-10kg', 'gelo'], ['skol-litrao-1l', 'cervejas'], ['amendoim-dori-torrado-100g', 'salgadinhos']]) {
    assert.equal(isBeverageLibraryItem({ slug, globalCategory: { slug: category } }), true);
  }
  assert.equal(beverageManufacturer('Budweiser', 'cervejas'), 'Ambev');
  assert.equal(beverageManufacturer('Guaraná Jesus', 'refrigerantes'), 'Sistema Coca-Cola');
  assert.equal(beverageManufacturer('Crystal', 'aguas'), 'Sistema Coca-Cola');
  assert.equal(beverageManufacturer('Crystal', 'cervejas'), 'Grupo Petrópolis');
});
