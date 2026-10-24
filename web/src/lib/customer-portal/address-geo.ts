import 'server-only';
import { prisma } from '@/lib/db';
import { z } from 'zod';

/**
 * Ponto confirmado no mapa e referência de cada endereço do cliente.
 *
 * O endereço do portal ainda não tem colunas de coordenada no banco de
 * produção (a migração depende de autorização). Até lá o ponto fica num
 * registro chave‑valor do servidor, indexado pelo id do endereço. Só é lido
 * e gravado por código do servidor que já conferiu o dono do endereço; o id
 * é um cuid não sequencial. Quando a migração for aplicada, basta mover os
 * dados para as colunas e trocar este módulo.
 */
export type AddressGeo = { latitude: number | null; longitude: number | null; reference: string | null };

const KEY_PREFIX = 'portal-address-geo:';
const geoSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  reference: z.string().max(200).nullable(),
}).refine((g) => (g.latitude === null) === (g.longitude === null));

export async function readAddressGeo(addressIds: string[]): Promise<Record<string, AddressGeo>> {
  if (!addressIds.length) return {};
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: addressIds.map((id) => KEY_PREFIX + id) } } });
  const out: Record<string, AddressGeo> = {};
  for (const row of rows) {
    const parsed = geoSchema.safeParse(row.value);
    if (parsed.success) out[row.key.slice(KEY_PREFIX.length)] = parsed.data;
  }
  return out;
}

export async function writeAddressGeo(addressId: string, geo: AddressGeo | null) {
  const key = KEY_PREFIX + addressId;
  if (!geo) {
    await prisma.platformSetting.deleteMany({ where: { key } });
    return;
  }
  const value = geoSchema.parse(geo);
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Lê ponto e referência enviados por formulário; ponto incompleto vira "sem ponto". */
export function geoFromForm(form: FormData): AddressGeo | null {
  const lat = Number(form.get('latitude'));
  const lng = Number(form.get('longitude'));
  const reference = String(form.get('reference') ?? '').trim().slice(0, 200) || null;
  const hasPoint = Boolean(form.get('latitude')) && Boolean(form.get('longitude')) && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!hasPoint && !reference) return null;
  return { latitude: hasPoint ? lat : null, longitude: hasPoint ? lng : null, reference };
}
