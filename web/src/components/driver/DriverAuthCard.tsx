import type { ReactNode } from 'react';

/** Moldura das telas de acesso do entregador, com a identidade Del Flash. */
export function DriverAuthCard({ store, children }: { store?: { name: string; logoUrl: string | null } | null; children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-ink-50 px-4 py-6">
      <div className="w-full min-w-0 max-w-[460px] rounded-xl bg-white p-5 text-center shadow-xl sm:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pwa/driver-192.png" alt="" width={46} height={46} className="mx-auto mb-4 rounded-xl" />
        <h1 className="text-[1.35rem] font-extrabold text-ink-900">Del Flash Entregador</h1>
        {store && (
          <p className="mx-auto mt-3 flex max-w-full items-center justify-center gap-2 rounded-lg bg-brand-light px-3 py-2 text-sm font-semibold text-ink-800" data-testid="driver-store">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {store.logoUrl ? <img src={store.logoUrl} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded object-cover" /> : null}
            <span className="min-w-0 break-words">{store.name}</span>
          </p>
        )}
        {children}
      </div>
    </main>
  );
}
