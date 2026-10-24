'use client';
import { useEffect, useState } from 'react';
import { getMyDriverScheduleAction } from '@/app/actions/drivers';
export function DriverScheduleNotice() {
  const [text, setText] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => { if (document.hidden || !navigator.onLine) return; const result = await getMyDriverScheduleAction(); if (active && result.ok) setText(`Escala (só organização da loja): ${result.availability.label.toLowerCase()}${result.tomorrow.shifts.length ? `. Amanhã (${result.tomorrow.date}): ${result.tomorrow.shifts.map(s => `${s.start}–${s.end}`).join(', ')}.` : ''}`); };
    void refresh(); const timer = window.setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return text ? <p className="flex items-start gap-2 rounded-xl bg-ink-100/70 px-3 py-2 text-[0.74rem] leading-snug text-ink-600" role="status"><span aria-hidden>🗓️</span><span className="min-w-0">{text}</span></p> : null;
}
