'use client';

export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main role="alert" className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Não foi possível abrir o cardápio</h1>
      <p className="text-sm">Confira sua conexão e tente novamente. Se você acabou de enviar um pedido, consulte a confirmação antes de enviá-lo outra vez.</p>
      <button type="button" onClick={reset} className="min-h-11 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Tentar novamente</button>
    </main>
  );
}
