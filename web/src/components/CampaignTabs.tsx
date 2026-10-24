import Link from 'next/link';
export function CampaignTabs({active}:{active:'beneficios'|'turbo'}) {
  return <nav aria-label="Tipos de campanha" className="flex flex-wrap gap-2 border-b border-ink-200 pb-4"><Link aria-current={active==='beneficios'?'page':undefined} href="/app/campanhas" className={`min-h-11 rounded-lg px-4 py-3 text-sm font-semibold ${active==='beneficios'?'bg-brand text-white':'bg-white text-ink-600'}`}>Descontos e campanhas</Link><Link aria-current={active==='turbo'?'page':undefined} href="/app/campanhas?aba=turbo" className={`min-h-11 rounded-lg px-4 py-3 text-sm font-semibold ${active==='turbo'?'bg-brand text-white':'bg-white text-ink-600'}`}>Entrega Turbo</Link></nav>;
}
