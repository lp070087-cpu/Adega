/**
 * ═══════════════════════════════════════════════════════════════════════
 * AGENDA SEMANAL — funções puras, sem banco
 * -----------------------------------------------------------------------
 * Moram AQUI, e não em lib/data, porque os dois lados precisam delas: a
 * tela monta a agenda a partir do padrão sugerido, e a server action grava
 * o resumo legível. `lib/data/*` é marcado com 'server-only' — importar
 * `defaultSchedule` de lá para um componente cliente quebraria o build.
 *
 * Nada neste arquivo toca Prisma, sessão ou rede: entra dado, sai dado.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OpeningPeriod = { open: string; close: string };
export type WeekdaySchedule = { weekday: number; closed: boolean; periods: OpeningPeriod[] };

/** 0 = domingo … 6 = sábado, como Date.getDay(). */
export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/**
 * Agenda inicial sugerida (passo 3.16). É só um ponto de partida — o
 * lojista fecha o dia que quiser e acrescenta quantos períodos precisar.
 */
export function defaultSchedule(): WeekdaySchedule[] {
  // Semana 18h–23h (jantar), fim de semana 11h–23h (almoço e jantar).
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    closed: false,
    periods: [
      weekday === 0 || weekday === 6
        ? { open: '11:00', close: '23:00' }
        : { open: '18:00', close: '23:00' },
    ],
  }));
}

/** Garante os 7 dias, na ordem, mesmo se o rascunho vier incompleto. */
export function normalizeSchedule(value: unknown): WeekdaySchedule[] {
  const input = Array.isArray(value) ? (value as WeekdaySchedule[]) : [];
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const found = input.find((d) => Number(d?.weekday) === weekday);
    if (!found) return { weekday, closed: false, periods: [] };
    return {
      weekday,
      closed: Boolean(found.closed),
      periods: Array.isArray(found.periods)
        ? found.periods
            .filter((p) => p && typeof p.open === 'string' && typeof p.close === 'string')
            .slice(0, 4)
        : [],
    };
  });
}

/**
 * Texto curto de funcionamento, para o campo livre Organization.openingHours.
 *
 * A agenda estruturada vive em settings.openingHours (Json). Este resumo
 * existe porque a vitrine, o painel e o app do entregador já mostram esse
 * texto — reescrever os três para ler a agenda seria mudar contrato por um
 * ganho que ninguém pediu.
 *
 * Agrupa dias consecutivos com o MESMO horário: sem isso, sete linhas
 * iguais viram um parágrafo ilegível.
 */
export function summarizeSchedule(schedule: WeekdaySchedule[]): string | null {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;

  const ordered = [...schedule].sort((a, b) => a.weekday - b.weekday);
  const signature = (day: WeekdaySchedule) =>
    day.closed || day.periods.length === 0
      ? 'FECHADO'
      : day.periods.map((p) => `${p.open}-${p.close}`).join('|');

  const groups: Array<{ from: number; to: number; sig: string }> = [];
  for (const day of ordered) {
    const sig = signature(day);
    const last = groups[groups.length - 1];
    if (last && last.sig === sig && day.weekday === last.to + 1) {
      last.to = day.weekday;
    } else {
      groups.push({ from: day.weekday, to: day.weekday, sig });
    }
  }

  const parts = groups.map((group) => {
    const label =
      group.from === group.to
        ? WEEKDAY_SHORT[group.from]
        : `${WEEKDAY_SHORT[group.from]} a ${WEEKDAY_SHORT[group.to]}`;

    if (group.sig === 'FECHADO') return `${label}: fechado`;

    const periods = group.sig
      .split('|')
      .map((p) => {
        const [open, close] = p.split('-');
        return `${toHour(open!)} às ${toHour(close!)}`;
      })
      .join(' e ');

    return `${label}, ${periods}`;
  });

  return parts.join(' · ');
}

/** "18:00" → "18h". "18:30" → "18h30". Mais curto para caber no resumo. */
function toHour(value: string): string {
  const [h, m] = value.split(':');
  return m === '00' ? `${h}h` : `${h}h${m}`;
}

// ── AGORA ESTÁ ABERTO? ─────────────────────────────────────────────────
/**
 * A loja está aberta neste instante, segundo a agenda DA SEMANA.
 *
 * Existe porque `storeStatus` (OPEN/CLOSED/PAUSED) é a decisão MANUAL do
 * lojista, e ela sozinha mente duas vezes: diz "aberta" às 3h da manhã de
 * quem esqueceu de fechar, e diz "aberta" para quem abre às 18h. A vitrine
 * cruza as duas informações — o que o lojista decidiu e o que a agenda diz.
 *
 * Agenda vazia (loja que nunca configurou horário) devolve `null`: não dá
 * para afirmar nem negar, e afirmar "fechada" bloquearia vendas de uma loja
 * que está atendendo normalmente.
 *
 * Período que atravessa a meia-noite (22:00–02:00) é tratado: compara a hora
 * atual com o dia de HOJE e também com a madrugada herdada de ONTEM.
 */
export function isOpenNow(
  schedule: WeekdaySchedule[],
  now: Date = new Date(),
): boolean | null {
  const days = Array.isArray(schedule) ? schedule : [];
  if (days.length === 0) return null;

  const anyPeriod = days.some((day) => !day.closed && day.periods.length > 0);
  if (!anyPeriod) return null;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = days.find((day) => day.weekday === now.getDay());
  const yesterdayWeekday = (now.getDay() + 6) % 7;
  const yesterday = days.find((day) => day.weekday === yesterdayWeekday);

  const inPeriod = (period: OpeningPeriod): [number, number] => [
    toMinutes(period.open),
    toMinutes(period.close),
  ];

  for (const period of today?.periods ?? []) {
    const [start, end] = inPeriod(period);
    if (end > start) {
      if (minutesNow >= start && minutesNow < end) return true;
    } else {
      // Atravessa a meia-noite: vale de `start` até 23h59.
      if (minutesNow >= start) return true;
    }
  }

  // Madrugada do período que começou ontem (ex.: 22h–02h).
  if (yesterday && !yesterday.closed) {
    for (const period of yesterday.periods) {
      const [start, end] = inPeriod(period);
      if (end <= start && minutesNow < end) return true;
    }
  }

  return false;
}

function toMinutes(value: string): number {
  const [h, m] = String(value).split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

/** Rótulo único de status combinando decisão do lojista e agenda. */
export type StoreOpenState = 'OPEN' | 'CLOSED_BY_SCHEDULE' | 'PAUSED' | 'CLOSED';

export function storeOpenState(
  storeStatus: string,
  schedule: WeekdaySchedule[],
  now: Date = new Date(),
): StoreOpenState {
  if (storeStatus === 'PAUSED') return 'PAUSED';
  if (storeStatus === 'CLOSED') return 'CLOSED';
  const bySchedule = isOpenNow(schedule, now);
  if (bySchedule === false) return 'CLOSED_BY_SCHEDULE';
  return 'OPEN';
}

export const STORE_OPEN_STATE_LABEL: Record<StoreOpenState, string> = {
  OPEN: 'Aberta agora',
  CLOSED_BY_SCHEDULE: 'Fechada agora',
  PAUSED: 'Pausada',
  CLOSED: 'Fechada',
};
