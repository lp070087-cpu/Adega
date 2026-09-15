'use client';

import { cn } from '@/lib/utils';
import { Button, Input } from '@/components/ui';
import {
  WEEKDAY_LABELS,
  defaultSchedule,
  normalizeSchedule,
  summarizeSchedule,
  type WeekdaySchedule,
} from '@/lib/schedule';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AGENDA DA SEMANA (Fase 4.23)
 * -----------------------------------------------------------------------
 * Cada dia aceita VÁRIOS períodos — o intervalo do almoço é o caso real
 * (11h–14h e 18h–23h). Um par fixo de horários obrigaria o lojista a
 * mentir sobre o funcionamento.
 *
 * Este componente é CONTROLADO: quem guarda o estado é o formulário de
 * Minha Loja, que salva junto com o resto. Não existe action própria aqui
 * — duas telas salvando o mesmo campo seria exatamente a duplicação que
 * a Fase 4 pede para evitar.
 *
 * Nada de banco nem de rede neste arquivo: `lib/schedule` é puro, e é por
 * isso que ele pode ser importado de um componente cliente.
 * ═══════════════════════════════════════════════════════════════════════
 */

export function ScheduleEditor({
  value,
  onChange,
  disabled,
}: {
  value: WeekdaySchedule[];
  onChange: (next: WeekdaySchedule[]) => void;
  disabled?: boolean;
}) {
  const days = normalizeSchedule(value);

  function update(weekday: number, patch: Partial<WeekdaySchedule>) {
    onChange(days.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  function addPeriod(weekday: number) {
    const day = days.find((d) => d.weekday === weekday);
    if (!day || day.periods.length >= 4) return;
    // Sugere o intervalo da noite quando o dia está vazio; senão abre uma
    // janela depois da última — o lojista ajusta, mas não começa do zero.
    const last = day.periods[day.periods.length - 1];
    const next = last ? { open: last.close, close: '23:30' } : { open: '18:00', close: '23:00' };
    update(weekday, { closed: false, periods: [...day.periods, next] });
  }

  const summary = summarizeSchedule(days);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.78rem] text-ink-500">
          Fechar um dia é mais honesto que inventar um horário. O resumo abaixo é o que aparece na
          vitrine.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(defaultSchedule())}
        >
          Usar horário sugerido
        </Button>
      </div>

      <div className="divide-y divide-ink-100 overflow-hidden rounded-lg border border-ink-200">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-col gap-2 bg-white p-3 sm:flex-row sm:items-start">
            <div className="flex items-center gap-2 sm:w-[150px] sm:flex-shrink-0 sm:pt-1.5">
              <input
                type="checkbox"
                id={`open-${day.weekday}`}
                checked={!day.closed}
                disabled={disabled}
                onChange={(e) =>
                  update(day.weekday, {
                    closed: !e.target.checked,
                    // Marcar um dia que não tinha horário CRIA um: deixar
                    // sem período faria o dia continuar fechado, e o
                    // lojista acharia que o clique não funcionou.
                    periods:
                      e.target.checked && day.periods.length === 0
                        ? [{ open: '18:00', close: '23:00' }]
                        : day.periods,
                  })
                }
                className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
              />
              <label
                htmlFor={`open-${day.weekday}`}
                className={cn(
                  'cursor-pointer text-[0.84rem] font-semibold',
                  day.closed ? 'text-ink-400' : 'text-ink-800',
                )}
              >
                {WEEKDAY_LABELS[day.weekday]}
              </label>
            </div>

            <div className="flex-1 space-y-2">
              {day.closed ? (
                <p className="py-1.5 text-[0.8rem] text-ink-400">Fechado</p>
              ) : day.periods.length === 0 ? (
                <p className="py-1.5 text-[0.8rem] text-warn">
                  Sem horário definido — este dia conta como fechado.
                </p>
              ) : (
                day.periods.map((period, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      value={period.open}
                      disabled={disabled}
                      aria-label={`${WEEKDAY_LABELS[day.weekday]} — abertura ${index + 1}`}
                      onChange={(e) =>
                        update(day.weekday, {
                          periods: day.periods.map((p, i) =>
                            i === index ? { ...p, open: e.target.value } : p,
                          ),
                        })
                      }
                      className="!w-[128px] !py-1.5 text-[0.84rem]"
                    />
                    <span className="text-[0.8rem] text-ink-400">até</span>
                    <Input
                      type="time"
                      value={period.close}
                      disabled={disabled}
                      aria-label={`${WEEKDAY_LABELS[day.weekday]} — fechamento ${index + 1}`}
                      onChange={(e) =>
                        update(day.weekday, {
                          periods: day.periods.map((p, i) =>
                            i === index ? { ...p, close: e.target.value } : p,
                          ),
                        })
                      }
                      className="!w-[128px] !py-1.5 text-[0.84rem]"
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        update(day.weekday, {
                          periods: day.periods.filter((_, i) => i !== index),
                        })
                      }
                      className="rounded-sm px-2 py-1.5 text-[0.74rem] font-semibold text-ink-400 transition-all hover:bg-ink-100 hover:text-danger disabled:opacity-50"
                      aria-label={`Remover período ${index + 1} de ${WEEKDAY_LABELS[day.weekday]}`}
                    >
                      Remover
                    </button>
                  </div>
                ))
              )}

              {!day.closed && day.periods.length < 4 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => addPeriod(day.weekday)}
                  className="rounded-sm px-2 py-1 text-[0.74rem] font-semibold text-brand transition-all hover:bg-brand-light disabled:opacity-50"
                >
                  + Outro período
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[0.76rem] text-ink-500">
        {summary ? (
          <>
            Fica assim na vitrine: <strong className="text-ink-700">{summary}</strong>
          </>
        ) : (
          'Defina ao menos um horário para a vitrine mostrar quando você abre.'
        )}
      </p>
    </div>
  );
}
