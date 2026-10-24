'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { saveTurboAction, previewTurboAction, publishTurboAction } from '@/app/actions/turbo';
import type { TurboCampaign } from '@/lib/turbo';

const field = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm';
const button = 'min-h-11 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50';
const days = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const localDate = (value?: string) => value ? new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(value)) : '';
type Customer = { id: string; name: string };
export function TurboCampaignForm({ campaign, customers }: { campaign?: TurboCampaign; customers: Customer[] }) {
  const [state, action, pending] = useActionState(saveTurboAction,{ok:false,message:''});
  const [audience,setAudience] = useState(campaign?.audience ?? 'ALL');
  return <form action={action} className="grid min-w-0 gap-4 sm:grid-cols-2" aria-busy={pending}>
    <input type="hidden" name="id" value={campaign?.id ?? ''}/>
    <label className="min-w-0 text-sm">Nome da campanha<input name="name" required minLength={3} maxLength={100} defaultValue={campaign?.name} className={field}/></label>
    <label className="min-w-0 text-sm">Situação<select name="status" defaultValue={campaign?.status ?? 'DRAFT'} className={field}><option value="DRAFT">Rascunho</option><option value="ACTIVE">Ativa</option><option value="PAUSED">Pausada</option></select></label>
    <label className="min-w-0 text-sm">Início<input name="startsAt" type="date" required defaultValue={localDate(campaign?.startsAt)} className={field}/></label>
    <label className="min-w-0 text-sm">Término<input name="endsAt" type="date" required defaultValue={localDate(campaign?.endsAt)} className={field}/></label>
    <label className="min-w-0 text-sm">Horário inicial<input name="startTime" type="time" required defaultValue={campaign?.startTime ?? '08:00'} className={field}/></label>
    <label className="min-w-0 text-sm">Horário final<input name="endTime" type="time" required defaultValue={campaign?.endTime ?? '23:00'} className={field}/></label>
    <fieldset className="min-w-0 sm:col-span-2"><legend className="text-sm">Dias da semana · horário de São Paulo</legend><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{days.map((day,index) => <label key={day} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="weekdays" value={index} defaultChecked={campaign ? campaign.weekdays.includes(index) : true}/>{day}</label>)}</div><p className="mt-1 text-xs text-ink-500">O horário final anterior ao inicial termina no dia seguinte.</p></fieldset>
    <label className="min-w-0 text-sm sm:col-span-2">Público<select name="audience" value={audience} onChange={event => setAudience(event.target.value as typeof audience)} className={field}><option value="ALL">Todos os clientes elegíveis</option><option value="RECENT_30">Pedidos entregues nos últimos 30 dias</option><option value="CUSTOM">Público personalizado</option></select></label>
    {audience === 'CUSTOM' ? <><label className="min-w-0 text-sm sm:col-span-2">Clientes específicos (opcional quando usar filtros)<select name="customerIds" multiple size={5} defaultValue={campaign?.customerIds ?? []} className={field}>{customers.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><span className="mt-1 block text-xs text-ink-500">Selecione clientes e/ou filtros abaixo. Quando combinados, todos os critérios serão exigidos.</span></label><label className="min-w-0 text-sm">Mínimo de pedidos entregues<input name="minOrders" type="number" min={0} max={10000} required defaultValue={campaign?.minOrders ?? 0} className={field}/></label><label className="min-w-0 text-sm">Dias mínimos sem pedido entregue<input name="inactiveDays" type="number" min={0} max={730} required defaultValue={campaign?.inactiveDays ?? 0} className={field}/></label></> : <><input type="hidden" name="minOrders" value={0}/><input type="hidden" name="inactiveDays" value={0}/></>}
    <label className="min-w-0 text-sm">Intervalo mínimo entre avisos (horas)<input name="frequencyHours" type="number" min={24} max={8760} required defaultValue={campaign?.frequencyHours ?? 168} className={field}/></label>
    <label className="min-w-0 text-sm">Limite total de clientes<input name="audienceLimit" type="number" min={1} max={1000} required defaultValue={campaign?.audienceLimit ?? 100} className={field}/></label>
    <label className="min-w-0 text-sm sm:col-span-2">Condições da entrega<textarea name="conditions" required minLength={10} maxLength={1000} defaultValue={campaign?.conditions} className={field} placeholder="Bairros atendidos, capacidade e prazo que a loja consegue cumprir."/></label>
    <label className="min-w-0 text-sm sm:col-span-2">Mensagem personalizada<textarea name="message" required minLength={10} maxLength={1000} defaultValue={campaign?.message} className={field}/></label>
    <label className="min-w-0 text-sm sm:col-span-2">Motivo da alteração<input name="reason" required minLength={5} maxLength={500} className={field}/></label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="capacityConfirmed" className="mt-1"/>Para ativar: conferi entregadores, capacidade e as condições de entrega. O prazo depende da operação da loja.</label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirm" required className="mt-1"/>Confirmo esta configuração. Salvar não publica avisos.</label>
    {state.message && <p role="status" className={`text-sm sm:col-span-2 ${state.ok ? 'text-emerald-700' : 'text-red-700'}`}>{state.message}</p>}
    <div className="sm:col-span-2"><button disabled={pending} className={button}>{pending ? 'Salvando…' : 'Salvar Entrega Turbo'}</button></div>
  </form>;
}

type Preview = { digest: string; customers: Customer[]; evaluated: number; excluded: number; active: boolean };
export function TurboAudiencePreview({campaignId}:{campaignId:string}) {
  const [preview,setPreview] = useState<Preview | null>(null);
  const [error,setError] = useState('');
  const [loading,startTransition] = useTransition();
  const [state,action,publishing] = useActionState(publishTurboAction,{ok:false,message:''});
  useEffect(() => { if (state.ok) setPreview(null); },[state]);
  function refresh() { startTransition(async () => { setError(''); const result = await previewTurboAction(campaignId); if(result.ok) setPreview(result.preview); else {setPreview(null);setError(result.message);} }); }
  return <div className="space-y-4">
    <p className="text-sm leading-6 text-ink-500">A prévia considera validade, horário atual, consentimento específico, descadastro, frequência e limites. Rascunhos são simulados como ativos. Avisos aparecem apenas na área identificada do cliente; nenhum envio externo será feito.</p>
    <button type="button" disabled={loading || publishing} onClick={refresh} className="min-h-11 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold disabled:opacity-50">{loading ? 'Consultando público…' : 'Visualizar público elegível'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview && <><div className="rounded-lg bg-ink-50 p-4 text-sm"><strong>{preview.customers.length} clientes elegíveis</strong><p className="mt-1 text-ink-500">{preview.evaluated} avaliados · {preview.excluded} fora dos critérios ou do limite configurado.</p>{preview.customers.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-medium">Conferir clientes</summary><ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">{preview.customers.map(c => <li key={c.id}>{c.name}</li>)}</ul></details>}</div>{!preview.active && <p className="text-sm text-ink-500">Ative e salve a campanha antes de publicar. Nenhum aviso foi criado.</p>}{preview.active && preview.customers.length > 0 && <form action={action} className="grid gap-4 sm:grid-cols-2" aria-busy={publishing}><input type="hidden" name="campaignId" value={campaignId}/><input type="hidden" name="digest" value={preview.digest}/><label className="text-sm sm:col-span-2">Motivo da publicação<input name="reason" minLength={5} maxLength={500} required className={field}/></label><label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="capacityConfirmed" type="checkbox" required className="mt-1"/>Conferi novamente a capacidade e as condições da Entrega Turbo.</label><label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="confirm" type="checkbox" required className="mt-1"/>Autorizo publicar somente avisos internos para os {preview.customers.length} clientes desta prévia.</label><div className="sm:col-span-2"><button className={button} disabled={publishing}>{publishing ? 'Publicando…' : 'Confirmar avisos internos'}</button></div></form>}</>}
    {state.message && <p role="status" className={`text-sm ${state.ok ? 'text-emerald-700' : 'text-red-700'}`}>{state.message}</p>}
  </div>;
}
