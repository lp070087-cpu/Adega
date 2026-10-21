'use server';
import { z } from 'zod';
import { passwordSchema } from '@/lib/validations/common';
import { requestDriverInvitation, consumeDriverInvitation } from '@/lib/auth/driver-invitation';
import { driverMailReady } from '@/lib/auth/driver-access';
import { OperationError } from '@/lib/operation-error';
export type DriverInvitationState = { ok: boolean; message: string };
const slug = z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export async function requestDriverInvitationAction(_state: DriverInvitationState, form: FormData): Promise<DriverInvitationState> {
  const input = z.object({ slug, email: z.string().trim().email().max(254), password: passwordSchema.refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Use uma senha de até 72 bytes.'), confirm: z.string() }).refine(value => value.password === value.confirm, { message: 'As senhas precisam ser iguais.' }).safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: input.error.issues[0]?.message ?? 'Confira os dados.' };
  if (!driverMailReady()) return { ok: false, message: 'O convite está pendente; o envio de e-mail aguarda configuração pela plataforma.' };
  try { await requestDriverInvitation(input.data.slug, input.data.email, input.data.password); } catch { /* Do not expose account existence or provider response. */ }
  return { ok: true, message: 'Se este e-mail tiver um convite ativo nesta loja, você receberá o link para confirmar sua identidade. A senha só será ativada após a confirmação. Confira a caixa de entrada e o spam; aguarde 30 minutos antes de solicitar novamente.' };
}
export async function verifyDriverInvitationAction(_state: DriverInvitationState, form: FormData): Promise<DriverInvitationState> {
  const input = z.object({ slug, userId: z.string().min(1).max(100), token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: 'Confira o link de confirmação recebido por e-mail.' };
  try { await consumeDriverInvitation(input.data.slug, input.data.userId, input.data.token); return { ok: true, message: 'E-mail confirmado e senha ativada. Entre no aplicativo com seu e-mail e a senha que você escolheu.' }; }
  catch (error) { return { ok: false, message: error instanceof OperationError ? error.message : 'Não foi possível confirmar o convite. Solicite um novo link.' }; }
}
