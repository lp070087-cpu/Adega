/** Read-only local inventory. No database access or file copies. Run from web: npx tsx scripts/catalog-inventory.ts. */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { GLOBAL_PRODUCT_SEEDS } from '../src/data/global-products';
import { CATALOG_PHOTOS } from '../src/lib/catalog-photo-manifest';
import { slugify } from '../src/lib/utils';

const root = process.cwd();
const isImage = (path: string) => /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(path);
function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : isImage(entry.name) ? [join(path, entry.name)] : []);
}
const groups = ['biblioteca-produtos', 'public/catalog', '../Public produtos', 'Banneres public'].map(folder => {
  const files = walk(join(root, folder));
  const hashes = new Map<string, string[]>();
  for (const file of files) {
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    hashes.set(hash, [...(hashes.get(hash) ?? []), relative(root, file)]);
  }
  return { folder, files: files.length, bytes: files.reduce((sum, file) => sum + statSync(file).size, 0), extensions: Object.fromEntries([...new Set(files.map(extname))].map(ext => [ext, files.filter(file => extname(file) === ext).length])), uniqueByteContents: hashes.size, identicalCopies: files.length - hashes.size, duplicateGroups: [...hashes.values()].filter(paths => paths.length > 1) };
});
const withExactPhoto = GLOBAL_PRODUCT_SEEDS.filter(product => CATALOG_PHOTOS[slugify(product.n)]);
console.log(JSON.stringify({ groups, deployedManifest: Object.keys(CATALOG_PHOTOS).length, seedProducts: GLOBAL_PRODUCT_SEEDS.length, seedProductsWithExactNamePhoto: withExactPhoto.length, seedProductsWithoutExactNamePhoto: GLOBAL_PRODUCT_SEEDS.filter(product => !CATALOG_PHOTOS[slugify(product.n)]).map(product => ({ name: product.n, category: product.c })), deployedPhotosByCategory: Object.fromEntries([...new Set(Object.values(CATALOG_PHOTOS).map(path => path.split('/').slice(2, -1).join('/')))].map(category => [category, Object.values(CATALOG_PHOTOS).filter(path => path.includes(`/catalog/${category}/`)).length])) }, null, 2));
