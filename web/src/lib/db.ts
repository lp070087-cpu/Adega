import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma único.
 *
 * Em desenvolvimento o Next recarrega os módulos a cada edição; sem o
 * cache no globalThis cada reload abriria um pool novo e o Neon derrubaria
 * a conexão por excesso de clientes.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Tipos auxiliares para os cálculos monetários.
 * O Prisma devolve Decimal; as camadas de apresentação trabalham em number.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  // Prisma.Decimal expõe toNumber()
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}
