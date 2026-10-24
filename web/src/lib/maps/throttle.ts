import 'server-only';
import { headers } from 'next/headers';

/**
 * Limite por IP na memória da instância. As buscas de mapa são públicas e
 * o Nominatim proíbe tráfego pesado; um cliente real faz poucas por pedido.
 */
const buckets = new Map<string, number[]>();

export async function mapRequestAllowed(bucket: 'search' | 'reverse', limitPerMinute: number) {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limitPerMinute) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 10_000) buckets.clear();
  return true;
}
