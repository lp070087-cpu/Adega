'use client';
import { useState,useTransition } from 'react';
import { saveAssistantPreferences } from '@/app/actions/assistant-preferences';
import type { AssistantPreferences } from '@/lib/assistant/preferences';
export function AssistantPreferencesForm({value}:{value:AssistantPreferences}) {
  const [message,setMessage] = useState(''); const [pending,start] = useTransition();
  return <form className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2 sm:p-5" action={form => start(async()=>{const result=await saveAssistantPreferences(form);setMessage(result.ok?'Preferências salvas. A conexão oficial permanece independente.':('error' in result?result.error:'Não foi possível salvar.'));})}>
    <h2 className="font-semibold sm:col-span-2">Número e horário de atendimento</h2><label className="grid gap-2 text-sm">Número empresarial solicitado<input className="field-input" name="businessPhone" type="tel" defaultValue={value.businessPhone} placeholder="+5581999999999"/><small className="text-ink-500">Informar o número não comprova sua titularidade nem conecta a Meta.</small></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input name="hoursEnabled" type="checkbox" defaultChecked={value.hoursEnabled}/>Limitar respostas ao horário configurado</label>
    <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm">Dias de início do atendimento · horário de Brasília</legend><div className="flex flex-wrap gap-3">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day,index)=><label key={day} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="days" value={index} defaultChecked={value.days.includes(index)}/>{day}</label>)}</div></fieldset>
    <label className="grid gap-2 text-sm">Início<input className="field-input" type="time" name="opens" defaultValue={value.opens} required/></label><label className="grid gap-2 text-sm">Fim<input className="field-input" type="time" name="closes" defaultValue={value.closes} required/></label>
    <label className="grid gap-2 text-sm sm:col-span-2">Resposta automática fora do horário<textarea className="field-input min-h-24" name="awayMessage" minLength={5} maxLength={500} defaultValue={value.awayMessage} required/></label><button disabled={pending} className="min-h-11 rounded-lg bg-brand px-4 py-3 font-semibold text-white">{pending?'Salvando…':'Salvar preferências'}</button>{message&&<p className="text-sm sm:col-span-2" role="status">{message}</p>}
  </form>;
}
