import { BadgeCheck,Ban,Bike,ClipboardCheck,Clock3,PackageOpen,Store } from 'lucide-react';
import { orderTracking,type TrackingInput,type TrackingStepKey } from '@/lib/order-tracking';
import './order-tracker.css';

const ICONS:Record<TrackingStepKey,typeof Bike>={CONFIRMED:ClipboardCheck,PREPARING:PackageOpen,DISPATCHED:Bike,READY:Store,DELIVERED:BadgeCheck};
const time=(date:Date|null)=>date?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(date):null;
const STATE_LABEL={done:'concluído',current:'etapa atual',pending:'pendente'} as const;

/** Visual progress for one order. Purely derived from persisted status; `compact` hides times for lists. */
export function OrderTracker({order,compact=false,timeZone}:{order:TrackingInput;compact?:boolean;timeZone?:string}){
 const view=orderTracking(order);
 const format=(date:Date|null)=>timeZone&&date?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone}).format(date):time(date);
 return <div className={`order-tracker${compact?' order-tracker-compact':''}`} data-phase={view.phase}>
  <p className="order-tracker-headline" aria-live={compact?undefined:'polite'}>{view.phase==='cancelled'?<Ban size={compact?15:20} aria-hidden/>:view.phase==='waiting'?<Clock3 size={compact?15:20} aria-hidden/>:null}{view.headline}</p>
  <ol className="order-tracker-steps" aria-label={`Andamento do pedido: ${view.headline}`}>
   {view.steps.map((step,index)=>{const Icon=ICONS[step.key];return <li key={step.key} className="order-tracker-step" data-state={step.state} aria-current={step.state==='current'?'step':undefined}>
    {index>0&&<span className="order-tracker-link" data-filled={step.state!=='pending'} aria-hidden/>}
    <span className="order-tracker-icon"><Icon size={compact?16:22} aria-hidden/></span>
    <span className="order-tracker-label">{step.label}<span className="sr-only"> — {STATE_LABEL[step.state]}</span></span>
    {!compact&&step.at&&<time className="order-tracker-time" dateTime={step.at.toISOString()}>{format(step.at)}</time>}
   </li>;})}
  </ol>
  {!compact&&view.notice&&<p className="order-tracker-notice" data-tone={view.noticeTone??'info'}>{view.notice}</p>}
 </div>;
}
