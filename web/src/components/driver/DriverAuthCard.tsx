import type { ReactNode } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';

/** Moldura das telas de acesso do entregador (login, primeiro acesso, convite), com a identidade Del Flash. */
export function DriverAuthCard({ store, children }: { store?: { name: string; logoUrl: string | null } | null; children: ReactNode }) {
  return (
    <AuthShell
      audience="entregador"
      title="Área do entregador"
      badge={store ? (
        <p className="mb-4 flex max-w-full items-center gap-2 rounded-xl bg-brand-light px-3 py-2 text-sm font-semibold text-ink-800" data-testid="driver-store">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {store.logoUrl ? <img src={store.logoUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" /> : null}
          <span className="min-w-0 break-words">{store.name}</span>
        </p>
      ) : undefined}
    >
      <div className="auth-driver">{children}</div>
    </AuthShell>
  );
}
