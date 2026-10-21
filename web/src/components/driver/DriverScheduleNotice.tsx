'use client';
import { useEffect, useState } from 'react';
import { getMyDriverScheduleAction } from '@/app/actions/drivers';
export function DriverScheduleNotice() {
  const [text, setText] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => { if (document.hidden || !navigator.onLine) return; const result = await getMyDriverScheduleAction(); if (active && result.ok) setText(`${result.availability.label}${result.tomorrow.shifts.length ? `. Amanhã (${result.tomorrow.date}): ${result.tomorrow.shifts.map(s => `${s.start}–${s.end}`).join(', ')}.` : ''}`); };
    void refresh(); const timer = window.setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return text ? <p className="rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-600" role="status">{text}</p> : null;
}
