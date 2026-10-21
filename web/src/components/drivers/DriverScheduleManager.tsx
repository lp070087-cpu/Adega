'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DRIVER_DAYS, EMPTY_DRIVER_SCHEDULE, type DriverSchedule } from '@/lib/driver-schedule';
import { saveDriverScheduleAction, refreshDriverRemindersAction } from '@/app/actions/drivers';
import { Modal, Button } from '@/components/ui';

export function DriverScheduleManager({ drivers, schedules }: { drivers: { id: string; name: string; active: boolean }[]; schedules: Record<string, DriverSchedule> }) {
  const router = useRouter(); const [selected, setSelected] = useState(''); const [form, setForm] = useState<DriverSchedule>(EMPTY_DRIVER_SCHEDULE); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  useEffect(() => {
    const refresh = () => { if (!document.hidden && navigator.onLine) void refreshDriverRemindersAction(); };
    refresh(); const timer = window.setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const shift = (index: number, update: Partial<DriverSchedule['shifts'][number]>) => setForm(current => ({ ...current, shifts: current.shifts.map((s, i) => i === index ? { ...s, ...update } : s) }));
  function save() { setMessage(''); start(async () => { const result = await saveDriverScheduleAction(selected, form); if (!result.ok) setMessage(result.error); else { setSelected(''); setMessage('Escala salva e lembrete de amanhã atualizado.'); router.refresh(); } }); }
  return <section className="rounded-xl border border-ink-200 bg-white p-4">
    <h3 className="font-semibold text-ink-900">Escalas semanais</h3><p className="mt-1 text-sm text-ink-500">Turnos e intervalos no horário de Brasília. A escala controla novas atribuições; entregas em andamento continuam disponíveis.</p>
    <div className="mt-4 flex flex-wrap gap-2">{drivers.map(driver => <button type="button" key={driver.id} className="min-h-11 rounded-lg border border-ink-200 px-3 py-2 text-sm disabled:opacity-50" disabled={!driver.active} onClick={() => { setSelected(driver.id); setForm(structuredClone(schedules[driver.id] ?? EMPTY_DRIVER_SCHEDULE)); setMessage(''); }}>{driver.name} · {schedules[driver.id]?.enabled ? 'Com escala' : 'Sem restrição'}</button>)}</div>
    {!drivers.length && <p className="mt-3 text-sm text-ink-500">Cadastre um entregador para configurar os turnos.</p>}
    <button type="button" disabled={pending} className="mt-4 min-h-11 font-semibold text-brand" onClick={() => start(async () => { const result = await refreshDriverRemindersAction(); setMessage(result.ok ? `${result.count} lembrete(s) de amanhã conferido(s).` : result.error); })}>Conferir lembretes de amanhã</button>
    {message && <p role="status" className="mt-2 text-sm text-ink-600">{message}</p>}
    {selected && <Modal open onClose={() => !pending && setSelected('')} title={`Escala · ${drivers.find(d => d.id === selected)?.name ?? ''}`}>
      <div className="space-y-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Restringir novas atribuições aos turnos cadastrados</label>
        <p className="text-xs text-ink-500">Fuso: {form.timezone}. Fim anterior ao início indica virada da madrugada. Dias sem turno são folga quando a escala está habilitada.</p>
        {form.shifts.map((s, index) => <fieldset className="space-y-3 rounded-lg border border-ink-200 p-3" key={index}><legend className="px-1 text-sm font-semibold">Turno {index + 1}</legend>
          <label className="block text-sm">Dia<select className="field-input mt-1" value={s.day} onChange={e => shift(index, { day: Number(e.target.value) })}>{DRIVER_DAYS.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Início<input className="field-input mt-1" type="time" value={s.start} onChange={e => shift(index, { start: e.target.value })} /></label><label className="text-sm">Fim<input className="field-input mt-1" type="time" value={s.end} onChange={e => shift(index, { end: e.target.value })} /></label></div>
          {s.breaks.map((pause, b) => <div className="grid grid-cols-2 gap-3" key={b}><label className="text-sm">Intervalo: início<input className="field-input mt-1" type="time" value={pause.start} onChange={e => shift(index, { breaks: s.breaks.map((p, j) => j === b ? { ...p, start: e.target.value } : p) })} /></label><label className="text-sm">Fim<input className="field-input mt-1" type="time" value={pause.end} onChange={e => shift(index, { breaks: s.breaks.map((p, j) => j === b ? { ...p, end: e.target.value } : p) })} /></label><button className="col-span-2 text-left text-sm text-danger" type="button" onClick={() => shift(index, { breaks: s.breaks.filter((_, j) => j !== b) })}>Remover intervalo</button></div>)}
          <div className="flex flex-wrap justify-between gap-3"><button className="min-h-10 text-sm font-semibold text-brand" type="button" disabled={s.breaks.length >= 4} onClick={() => shift(index, { breaks: [...s.breaks, { start: '12:00', end: '13:00' }] })}>Adicionar intervalo</button><button className="min-h-10 text-sm text-danger" type="button" onClick={() => setForm({ ...form, shifts: form.shifts.filter((_, i) => i !== index) })}>Remover turno</button></div>
        </fieldset>)}
        <button type="button" className="min-h-11 text-sm font-semibold text-brand" disabled={form.shifts.length >= 28} onClick={() => setForm({ ...form, shifts: [...form.shifts, { day: 1, start: '09:00', end: '18:00', breaks: [] }] })}>Adicionar turno</button>
        {message && <p role="alert" className="text-sm text-danger">{message}</p>}
        <Button fullWidth disabled={pending} onClick={save}>{pending ? 'Salvando…' : 'Salvar escala'}</Button>
      </div>
    </Modal>}
  </section>;
}
