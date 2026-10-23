import 'server-only';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';

/**
 * Link único e permanente da área de entregadores de cada loja. É só um
 * endereço de descoberta: identifica a loja na tela de login, mas não dá
 * acesso a nada sem e-mail e senha do entregador cadastrado por ela.
 */
export const driverStorePath = (slug: string) => `/entregador/loja/${slug}`;
export const DRIVER_STORE_COOKIE = 'driver-store';

export async function publicOrigin() {
  const configured = process.env.APP_PUBLIC_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host');
  return host ? `${head.get('x-forwarded-proto') ?? 'https'}://${host}` : null;
}

export async function driverStoreBySlug(slug: string) {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return null;
  return prisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, logoUrl: true },
  });
}

let multiStore = false;
/**
 * Uma conta em várias lojas exige a unicidade (loja, conta) em Driver.
 * Enquanto a migração 20261023090000_driver_multistore não for aplicada,
 * o banco ainda tem uma unicidade global e o segundo vínculo é recusado
 * com uma mensagem clara, em vez de um erro de banco.
 */
export async function driverMultiStoreReady() {
  if (multiStore) return true;
  const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = 'Driver_organizationId_userId_key'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = 'Driver_userId_key'
    ) AS ok`;
  multiStore = Boolean(rows[0]?.ok);
  return multiStore;
}

/**
 * Marca a loja do link como loja de trabalho preferida. É só preferência:
 * o acesso continua decidido pelo vínculo ativo no banco (ver guards).
 */
export async function preferDriverStore(slug: string) {
  const store = slug ? await driverStoreBySlug(slug) : null;
  if (!store) return;
  (await cookies()).set(DRIVER_STORE_COOKIE, store.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
}
