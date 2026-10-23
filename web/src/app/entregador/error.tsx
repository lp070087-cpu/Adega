'use client';

/** Falha inesperada na área do entregador: tentar de novo, sem atalhos para outras áreas. */
export default function DriverError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-ink-50 px-4 py-6">
      <div role="alert" className="w-full max-w-[460px] rounded-xl bg-white p-6 text-center shadow-xl">
        <h1 className="text-lg font-extrabold text-ink-900">Não foi possível carregar</h1>
        <p className="mt-2 text-sm text-ink-500">Confira a conexão e tente de novo.</p>
        <button type="button" onClick={reset} className="mt-4 min-h-11 w-full rounded-lg bg-brand px-5 font-semibold text-white">Tentar novamente</button>
      </div>
    </main>
  );
}
