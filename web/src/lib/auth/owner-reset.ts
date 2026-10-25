import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { hashPassword } from './password';
import { OperationError } from '@/lib/operation-error';
import { isPlatformIdentity } from '@/lib/platform/identity';
import { driverMailReady } from './driver-access';

/**
 * Recuperação de senha do painel (dono e equipe da loja). Link de uso único,
 * válido por 30 minutos; só o hash do token fica no banco. A resposta pública
 * é a mesma para e-mail inexistente, conta de entregador ou suspensa.
 */
export const OWNER_RESET_MINUTES = 30;
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex');
const identifier = (userId: string) => `owner:reset:${userId}`;
export const ownerResetReady = driverMailReady;

export async function requestOwnerReset(rawEmail: string) {
  if (!ownerResetReady()) throw new OperationError('Envio de e-mail aguardando configuração pela plataforma.');
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { organizations: true } });
  if (!user?.active || !user.email || !user.organizations.some((m) => m.active && m.role !== 'DRIVER')) return;
  if (await isPlatformIdentity(prisma, user.id)) return;
  const key = identifier(user.id);
  const current = await prisma.verificationToken.findFirst({ where: { identifier: key } });
  if (current && current.expires.getTime() - OWNER_RESET_MINUTES * 60_000 + 60_000 > Date.now()) return; // reenvio após 60 s
  const raw = randomBytes(32).toString('hex');
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: key } }),
    prisma.verificationToken.create({ data: { identifier: key, token: digest(raw), expires: new Date(Date.now() + OWNER_RESET_MINUTES * 60_000) } }),
  ]);
  const link = `${process.env.APP_PUBLIC_URL}/login/redefinir?token=${raw}`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [user.email], subject: 'Redefinir sua senha do Del Flash', text: `Olá, ${user.name}.\n\nPara criar uma nova senha do painel Del Flash, abra o link abaixo (válido por ${OWNER_RESET_MINUTES} minutos):\n${link}\n\nSe você não pediu, ignore este e-mail.` }),
    });
    if (!response.ok) throw new Error('MAIL_FAILED');
  } catch {
    await prisma.verificationToken.deleteMany({ where: { identifier: key } });
    throw new OperationError('Não foi possível enviar o e-mail. Tente novamente em instantes.');
  }
}

export async function ownerResetValid(raw: string) {
  if (!/^[a-f0-9]{64}$/.test(raw)) return false;
  const row = await prisma.verificationToken.findFirst({ where: { token: digest(raw), identifier: { startsWith: 'owner:reset:' } } });
  return Boolean(row && row.expires > new Date());
}

export async function completeOwnerReset(raw: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(raw)) throw new OperationError('Link inválido ou expirado. Peça um novo.');
  const row = await prisma.verificationToken.findFirst({ where: { token: digest(raw), identifier: { startsWith: 'owner:reset:' } } });
  if (!row || row.expires <= new Date()) throw new OperationError('Link inválido ou expirado. Peça um novo.');
  const userId = row.identifier.slice('owner:reset:'.length);
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
    prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } }),
  ]);
}
