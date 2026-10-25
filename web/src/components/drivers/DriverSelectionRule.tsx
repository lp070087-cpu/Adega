'use client';

import { useState, useTransition } from 'react';
import { setDriverSelectionRuleAction } from '@/app/actions/drivers';

/** Quem aparece no seletor do cartão do pedido. A escala nunca bloqueia o entregador. */
export function DriverSelectionRule({ rule }: { rule: 'scheduled' | 'all' }) {
  const [value, setValue] = useState(rule);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choose = (next: 'scheduled' | 'all') => {
    setValue(next);
    start(async () => {
      const result = await setDriverSelectionRuleAction(next);
      setMessage(result.ok ? 'Regra salva.' : result.error ?? 'Não foi possível salvar.');
    });
  };
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4" data-testid="driver-selection-rule">
      <h3 className="text-[0.92rem] font-bold text-ink-900">Seletor de entregador nos pedidos</h3>
      <p className="mt-0.5 text-[0.78rem] text-ink-500">A escala serve para organizar a equipe; o entregador pode ficar online e trabalhar mesmo sem turno.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Quem aparece no seletor">
        {([
          ['scheduled', 'Programados para hoje', 'Mostra quem tem turno hoje e quem está online ou em entrega. Some só quem está offline e fora da escala. Sem escala ativa na equipe, mostra todos.'],
          ['all', 'Todos os entregadores', 'Mostra a equipe inteira, com ou sem escala.'],
        ] as const).map(([key, label, hint]) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink-200 p-3 has-[:checked]:border-brand has-[:checked]:ring-1 has-[:checked]:ring-brand">
            <input type="radio" name="driverSelection" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={value === key} disabled={pending} onChange={() => choose(key)} />
            <span><span className="block text-[0.84rem] font-semibold text-ink-900">{label}</span><span className="block text-[0.74rem] text-ink-500">{hint}</span></span>
          </label>
        ))}
      </div>
      {message && <p role="status" className="mt-2 text-[0.76rem] text-ink-600">{message}</p>}
    </section>
  );
}
