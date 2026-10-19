export default function StoreLoading() {
  return (
    <main role="status" aria-live="polite" className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 sm:p-6">
      <p className="text-sm">Carregando cardápio…</p>
      <div aria-hidden="true" className="h-40 rounded-2xl bg-neutral-500/10 sm:h-64" />
      <div aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-48 rounded-2xl bg-neutral-500/10" />)}
      </div>
    </main>
  );
}
