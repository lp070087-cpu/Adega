import { z } from 'zod';
export const assistantPreferencesSchema = z.object({
  businessPhone: z.string().trim().regex(/^$|^\+?[1-9]\d{9,14}$/),
  hoursEnabled: z.boolean(), days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  awayMessage: z.string().trim().min(5).max(500),
}).refine(value => !value.hoursEnabled || value.opens !== value.closes, 'Entrada e saída devem ser diferentes.');
export type AssistantPreferences = z.infer<typeof assistantPreferencesSchema>;
export const defaultAssistantPreferences: AssistantPreferences = { businessPhone:'', hoursEnabled:false, days:[0,1,2,3,4,5,6], opens:'08:00', closes:'18:00', awayMessage:'Recebemos sua mensagem. Nosso atendimento está fora do horário; a equipe retornará quando disponível.' };
export function readAssistantPreferences(value: unknown): AssistantPreferences {
  const parsed = assistantPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultAssistantPreferences;
}
export function assistantWithinHours(value: AssistantPreferences, now = new Date()) {
  if (!value.hoursEnabled) return true;
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'));
  const time = `${get('hour')}:${get('minute')}`;
  return value.opens < value.closes ? value.days.includes(day) && time >= value.opens && time < value.closes : (value.days.includes(day) && time >= value.opens) || (value.days.includes((day+6)%7) && time < value.closes);
}
