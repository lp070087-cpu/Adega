import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { storeProductAvailability } from '../src/lib/store-product-availability';

test('public catalog retains empty and temporarily paused products, excludes inactive and foreign products', async () => {
  const products = [
    { id: 'empty', organizationId: 'shop-a', active: true, available: true, stock: 0 },
    { id: 'paused', organizationId: 'shop-a', active: true, available: false, stock: 10 },
    { id: 'inactive', organizationId: 'shop-a', active: false, available: true, stock: 25 },
    { id: 'foreign', organizationId: 'shop-b', active: true, available: true, stock: 25 },
  ];
  let productQuery: any;
  const db = { category: { findMany: async () => [] }, product: { findMany: async (query: any) => {
    productQuery = query;
    return products.filter(product => Object.entries(query.where).every(([key, value]) => product[key as keyof typeof product] === value));
  } } };
  const imports: Record<string, unknown> = { 'server-only': {}, '@/lib/db': { prisma: db }, '@/lib/utils': { slugify: (name: string) => name } };
  const module = { exports: {} as any };
  const compiled = ts.transpileModule(readFileSync('src/lib/data/organization.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', compiled)((name: string) => { if (!(name in imports)) throw new Error(name); return imports[name]; }, module, module.exports);
  const result = await module.exports.getPublicCatalog('shop-a');
  assert.deepEqual(result.products.map((product: any) => product.id), ['empty', 'paused']);
  assert.equal(productQuery.take, undefined, 'the storefront cannot silently truncate published products');
  assert.equal(productQuery.select.variations.where.active, true);
});

test('replenishment changes availability immediately without republishing; combo capacity uses real components', () => {
  const product = { available: true, trackStock: true, stock: 0, combo: null };
  assert.equal(storeProductAvailability(product, 'shop-a').stock, 0);
  product.stock = 25;
  assert.deepEqual(storeProductAvailability(product, 'shop-a'), { available: true, trackStock: true, stock: 25 });
  const component = { organizationId: 'shop-a', active: true, available: true, trackStock: true, stock: 0 };
  const combo = { available: true, trackStock: false, stock: 0, combo: { items: [{ quantity: 2, product: component }] } };
  assert.equal(storeProductAvailability(combo, 'shop-a').stock, 0);
  component.stock = 25;
  assert.equal(storeProductAvailability(combo, 'shop-a').stock, 12);
  component.organizationId = 'shop-b';
  assert.equal(storeProductAvailability(combo, 'shop-a').available, false);
});
