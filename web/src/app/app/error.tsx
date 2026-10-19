'use client';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Não foi possível carregar esta página</h1>
      <p className="text-sm text-ink-500">Tente novamente. Se você estava salvando uma alteração, confira os dados antes de repetir.</p>
      <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Tentar novamente</button>
    </div>
  );
}
