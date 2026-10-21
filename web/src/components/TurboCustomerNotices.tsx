import type { GrowthState } from '@/lib/growth';
import { turboHoursMatch } from '@/lib/turbo';
export function TurboCustomerNotices({state,customerId}:{state:GrowthState;customerId:string}) {
  if(state.consents[customerId]?.optOut)return null;
  const notices=state.turboNotices.filter(n=>n.customerId===customerId).slice(-20).reverse();
  if(!notices.length)return null;
  const now=new Date();
  return <section aria-label="Avisos internos de Entrega Turbo" className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Seus avisos de Entrega Turbo</h2>{notices.map(notice=>{const current=state.turboCampaigns.find(c=>c.id===notice.campaignId);const available=current?.status==='ACTIVE'&&now>=new Date(current.startsAt)&&now<=new Date(current.endsAt)&&turboHoursMatch(current,now);return <article key={notice.id} className="mt-4 border-t border-slate-100 pt-4"><h3 className="font-semibold">{notice.title}</h3><p className="mt-1 text-xs text-slate-500">{available?'Confira as condições com a loja antes de concluir o pedido.':'Campanha fora do período, horário ou disponibilidade atual.'}</p><p className="mt-3 whitespace-pre-wrap text-sm">{notice.message}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{notice.conditions}</p><p className="mt-3 text-xs text-slate-500">Validade informada: {new Date(notice.endsAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})}. O prazo depende da confirmação operacional do estabelecimento.</p></article>;})}</section>;
}
