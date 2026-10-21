export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className="inline-flex items-center gap-2.5 font-bold tracking-tight text-[#0B1F3A]"><svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" className="shrink-0"><rect width="40" height="40" rx="11" fill="#0B1F3A"/><path d="M22 7 10 23h10l-2 10 13-17H21Z" fill="#FFFFFF"/><path d="M7 13h7M5 18h6" stroke="#168FE5" strokeWidth="2.5" strokeLinecap="round"/></svg>{!compact && <span>Del Flash</span>}</span>;
}
