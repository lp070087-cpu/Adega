type SkeletonVariant = 'dashboard' | 'list' | 'form' | 'catalog' | 'driver' | 'detail';

function Block({ className = '' }: { className?: string }) {
  return <div className={`rounded-lg bg-neutral-200/70 ${className}`} />;
}

function Summary() {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) =>
    <div key={i} className="min-w-0 space-y-4 rounded-xl bg-white p-4 shadow-sm"><Block className="h-3 w-2/3" /><Block className="h-7 w-1/2" /><Block className="h-2 w-3/4" /></div>,
  )}</div>;
}

function Rows() {
  return <div className="space-y-3 rounded-xl bg-white p-3 sm:p-5">{Array.from({ length: 5 }, (_, i) =>
    <div key={i} className="flex min-w-0 items-center gap-3 border-b border-neutral-100 py-3 last:border-0">
      <Block className="h-11 w-11 shrink-0" /><div className="min-w-0 flex-1 space-y-3"><Block className="h-3 w-2/3 sm:w-1/3" /><Block className="h-2 w-1/2" /></div><Block className="h-6 w-12 shrink-0 sm:w-20" />
    </div>,
  )}</div>;
}

function Fields() {
  return <div className="grid gap-5 rounded-xl bg-white p-4 sm:grid-cols-2 sm:p-6">{Array.from({ length: 6 }, (_, i) =>
    <div key={i} className="min-w-0 space-y-3"><Block className="h-3 w-1/3" /><Block className="h-11 w-full" /></div>,
  )}<Block className="h-11 w-32" /></div>;
}

/** Pure presentation: no private data, requests, focusable controls or fake results. */
export function RouteSkeleton({ variant = 'list', label = 'Carregando…' }: { variant?: SkeletonVariant; label?: string }) {
  const standalone = variant === 'catalog' || variant === 'driver';
  return <div role="status" aria-live="polite" aria-busy="true" className={`w-full min-w-0 space-y-5 ${standalone ? 'mx-auto px-4 py-5 sm:px-6' : ''} ${variant === 'catalog' ? 'max-w-6xl' : variant === 'driver' ? 'max-w-xl' : ''}`}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse motion-reduce:animate-none">
      <div className="space-y-3"><Block className="h-7 w-2/3 max-w-72" /><Block className="h-3 w-3/4 max-w-md" /></div>
      {variant === 'catalog' ? <>
        <Block className="h-56 w-full sm:h-80" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Block key={i} className={`h-10 ${i > 3 ? 'hidden sm:block' : ''}`} />)}</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="min-w-0 space-y-3 pb-4"><Block className="aspect-square w-full" /><Block className="h-2 w-1/3" /><Block className="h-4 w-4/5" /><Block className="h-3 w-full" /><div className="flex items-center justify-between gap-2"><Block className="h-5 w-1/2" /><Block className="h-10 w-10 shrink-0" /></div></div>)}</div>
      </> : variant === 'form' ? <Fields /> : variant === 'driver' ? <><Summary /><Rows /></> : variant === 'detail' ? <><Block className="h-20 w-full" /><Rows /></> : <>
        {variant === 'dashboard' && <Summary />}
        <div className="flex min-w-0 flex-wrap gap-3"><Block className="h-11 w-full sm:w-64" /><Block className="h-11 w-24" /></div>
        <Rows />
      </>}
    </div>
  </div>;
}
