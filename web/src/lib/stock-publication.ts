import { createHash } from 'node:crypto';

export type StockPublicationRow = { id: string; name: string; stock: number; minimumStock: number; active: boolean; available: boolean; trackStock: boolean; updatedAt: Date | string };
export type StockPublicationChange = { id: string; stock: number; minimumStock: number; active: boolean; available: boolean; trackStock: boolean };
export function stockPublicationDigest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildStockPublicationPreview(products: StockPublicationRow[], changes: StockPublicationChange[], excluded: Map<string, string>) {
  const byId = new Map(changes.map(row => [row.id, row]));
  return products.map(product => ({
    id: product.id, name: product.name,
    previous: { stock: product.stock, minimumStock: product.minimumStock, active: product.active, available: product.available, trackStock: product.trackStock },
    proposed: byId.get(product.id)!, updatedAt: new Date(product.updatedAt).toISOString(), excluded: excluded.get(product.id) ?? null,
  })).sort((a, b) => a.id.localeCompare(b.id));
}
