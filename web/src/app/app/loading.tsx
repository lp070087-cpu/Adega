export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-5 p-4 sm:p-6">
      <p className="text-sm text-ink-500">Carregando seu estabelecimento…</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl bg-ink-100" />)}
      </div>
    </div>
  );
}
