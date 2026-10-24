'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { DRIVER_DAYS, EMPTY_DRIVER_SCHEDULE, driverScheduleSchema, driverDaySummary, driverLocalDate, type DriverSchedule } from '@/lib/driver-schedule';
import { saveDriverScheduleAction, refreshDriverRemindersAction } from '@/app/actions/drivers';
import { Modal, Button } from '@/components/ui';

export function DriverScheduleManager({ drivers, schedules }: { drivers: { id: string; name: string; active: boolean }[]; schedules: Record<string, DriverSchedule> }) {
  const router = useRouter();
  const [selected, setSelected] = useState('');
  const [form, setForm] = useState<DriverSchedule>(EMPTY_DRIVER_SCHEDULE);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Calculado no navegador (depende do relógio), depois da montagem.
  const [today, setToday] = useState<{ weekday: number; list: Array<{ id: string; name: string; summary: string }> } | null>(null);
  useEffect(() => {
    const weekday = driverLocalDate(new Date(), 'America/Sao_Paulo').weekday;
    setToday({ weekday, list: drivers.filter(d => d.active && schedules[d.id]?.enabled && schedules[d.id].shifts.some(s => s.day === weekday)).map(d => ({ id: d.id, name: d.name, summary: driverDaySummary(schedules[d.id], weekday) })) });
  }, [drivers, schedules]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden && navigator.onLine) void refreshDriverRemindersAction(); };
    refresh(); const timer = window.setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const shift = (index: number, update: Partial<DriverSchedule['shifts'][number]>) => setForm(current => ({ ...current, shifts: current.shifts.map((s, i) => i === index ? { ...s, ...update } : s) }));
  function save(day?: number) {
    setMessage(''); setError('');
    const parsed = driverScheduleSchema.safeParse(form);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Confira os turnos.'); return; }
    start(async () => {
      const result = await saveDriverScheduleAction(selected, parsed.data);
      if (!result.ok) setError(result.error);
      else { setMessage(day === undefined ? 'Escala salva e lembrete de amanhã atualizado.' : `${DRIVER_DAYS[day]} salvo. Escala e lembrete atualizados.`); setOpenDay(null); if (day === undefined) setSelected(''); else document.getElementById(`driver-day-${selected}-${day}-button`)?.focus(); router.refresh(); }
    });
  }
  return <section className="rounded-xl border border-ink-200 bg-white p-4">
    <h3 className="font-semibold text-ink-900">Escalas semanais</h3><p className="mt-1 text-sm text-ink-500">Horários de Brasília. A escala organiza quem trabalha em cada dia; ela não impede o entregador online de receber pedidos.</p>
    <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50 p-3" data-testid="scheduled-today"><p className="text-[0.78rem] font-bold text-ink-800">Escalados hoje{today ? ` · ${DRIVER_DAYS[today.weekday]}` : ''}</p>{today && (today.list.length ? <ul className="mt-1.5 space-y-1">{today.list.map(item => <li key={item.id} className="text-[0.8rem] text-ink-700"><strong>{item.name}</strong> · {item.summary}</li>)}</ul> : <p className="mt-1 text-[0.78rem] text-ink-500">Ninguém escalado para hoje.</p>)}</div>
    <div className="mt-4 flex flex-wrap gap-2">{drivers.map(driver => <button type="button" key={driver.id} className="min-h-11 max-w-full rounded-lg border border-ink-200 px-3 py-2 text-left text-sm disabled:opacity-50" disabled={!driver.active} onClick={() => { setSelected(driver.id); setForm(structuredClone(schedules[driver.id] ?? EMPTY_DRIVER_SCHEDULE)); setOpenDay(null); setMessage(''); setError(''); }}>{driver.name} · {schedules[driver.id]?.enabled ? 'Com escala' : 'Sem restrição'}</button>)}</div>
    {!drivers.length && <p className="mt-3 text-sm text-ink-500">Cadastre um entregador para configurar os turnos.</p>}
    <button type="button" disabled={pending} className="mt-4 min-h-11 font-semibold text-brand" onClick={() => start(async () => { const result = await refreshDriverRemindersAction(); setMessage(result.ok ? `${result.count} lembrete(s) de amanhã conferido(s).` : result.error); })}>Conferir lembretes de amanhã</button>
    {message && <p role="status" className="mt-2 text-sm text-ink-600">{message}</p>}
    {selected && <Modal open onClose={() => !pending && setSelected('')} title={`Escala · ${drivers.find(d => d.id === selected)?.name ?? ''}`}>
      <div className="space-y-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.enabled} disabled={pending} onChange={e => setForm({ ...form, enabled: e.target.checked })}/>Usar escala para este entregador (organização da loja; não bloqueia pedidos)</label>
        <p className="text-xs text-ink-500">Fim anterior ao início indica virada da madrugada. Dias sem turno são folga quando a escala está habilitada.</p>
        <div className="space-y-2">{[1, 2, 3, 4, 5, 6, 0].map(day => {
          const indices = form.shifts.flatMap((s, index) => s.day === day ? [index] : []);
          const expanded = openDay === day;
          const panelId = `driver-day-${selected}-${day}`;
          return <section key={day} className="min-w-0 overflow-hidden rounded-lg border border-ink-200"><h4><button type="button" aria-expanded={expanded} aria-controls={panelId} id={`${panelId}-button`} disabled={pending} onClick={() => { setOpenDay(expanded ? null : day); setError(''); }} className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left"><span className="min-w-0"><span className="block text-sm font-semibold">{DRIVER_DAYS[day]}</span><span className="mt-1 block break-words text-xs font-normal text-ink-500">{driverDaySummary(form, day)}</span></span><ChevronDown size={18} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true"/></button></h4>
            <div id={panelId} role="region" aria-labelledby={`${panelId}-button`} hidden={!expanded} className="space-y-3 border-t border-ink-100 p-3">
              {!indices.length && <p className="text-sm text-ink-500">Sem escala neste dia. Adicione um turno para trabalhar.</p>}
              {indices.map((index, position) => { const s = form.shifts[index]; return <fieldset key={index} className="min-w-0 space-y-3 rounded-lg bg-ink-50 p-3" disabled={pending}><legend className="text-xs font-semibold">Turno {position + 1}</legend>
                <div className="grid min-w-0 grid-cols-2 gap-2"><label className="min-w-0 text-xs">Entrada<input className="field-input mt-1 min-w-0" type="time" value={s.start} onChange={e => shift(index, { start: e.target.value })}/></label><label className="min-w-0 text-xs">Saída<input className="field-input mt-1 min-w-0" type="time" value={s.end} onChange={e => shift(index, { end: e.target.value })}/></label></div>
                {s.breaks.map((pause, b) => <div className="grid min-w-0 grid-cols-2 gap-2" key={b}><label className="min-w-0 text-xs">Intervalo: início<input className="field-input mt-1 min-w-0" type="time" value={pause.start} onChange={e => shift(index, { breaks: s.breaks.map((p, j) => j === b ? { ...p, start: e.target.value } : p) })}/></label><label className="min-w-0 text-xs">Fim<input className="field-input mt-1 min-w-0" type="time" value={pause.end} onChange={e => shift(index, { breaks: s.breaks.map((p, j) => j === b ? { ...p, end: e.target.value } : p) })}/></label><button className="col-span-2 min-h-11 text-left text-xs text-danger" type="button" onClick={() => shift(index, { breaks: s.breaks.filter((_, j) => j !== b) })}>Remover intervalo</button></div>)}
                <div className="flex flex-wrap justify-between gap-2"><button className="min-h-11 text-xs font-semibold text-brand" type="button" disabled={s.breaks.length >= 4} onClick={() => shift(index, { breaks: [...s.breaks, { start: '12:00', end: '13:00' }] })}>Adicionar intervalo</button><button className="min-h-11 text-xs text-danger" type="button" onClick={() => setForm({ ...form, shifts: form.shifts.filter((_, i) => i !== index) })}>Remover turno</button></div>
              </fieldset>; })}
              <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={pending || form.shifts.length >= 28} className="min-h-11 text-sm font-semibold text-brand" onClick={() => setForm({ ...form, shifts: [...form.shifts, { day, start: '09:00', end: '18:00', breaks: [] }] })}>Adicionar turno</button><Button disabled={pending} onClick={() => save(day)}>Salvar dia</Button></div>
              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </div>
          </section>;
        })}</div>
        {error && openDay === null && <p role="alert" className="text-sm text-danger">{error}</p>}
        {message && <p role="status" className="text-sm text-ink-600">{message}</p>}
        <Button fullWidth disabled={pending} onClick={() => save()}>{pending ? 'Salvando…' : 'Salvar escala e fechar'}</Button>
      </div>
    </Modal>}
  </section>;
}
