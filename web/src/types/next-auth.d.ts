import type { Role } from '@prisma/client';
import type { DefaultSession } from 'next-auth';

/**
 * A sessão do Auth.js carrega o tenant. Sem estes tipos, cada leitura de
 * session.user.organizationId viraria um cast espalhado pelo código.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** null = usuário ainda sem estabelecimento (vai para o onboarding). */
      organizationId: string | null;
      role: Role | null;
      organizationName: string | null;
      organizationSlug: string | null;
      driverSessionStartedAt?: number;
      driverSessionUntil?: number;
    } & DefaultSession['user'];
  }

  interface User {
    sessionUntil?: number;
    driverSessionStartedAt?: number;
    driverSessionUntil?: number;
    organizationId?: string | null;
    role?: Role | null;
    organizationName?: string | null;
    organizationSlug?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sessionUntil?: number;
    driverSessionStartedAt?: number;
    driverSessionUntil?: number;
    userId?: string;
    organizationId?: string | null;
    role?: Role | null;
    organizationName?: string | null;
    organizationSlug?: string | null;
  }
}

export {};
