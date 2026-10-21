import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { hashPassword } from './password';
import { driverMailReady, driverTokenHash } from './driver-access';
import { isPlatformIdentity } from '@/lib/platform/identity';
import { revokeDriverSessions } from '@/lib/data/drivers';
import { OperationError } from '@/lib/operation-error';

const slugValid = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 160;
/** Only the authenticated identity's approved pending profile can select its store. */
export async function getPendingDriverInvitation(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { organizations: true } });
  if (!user?.active || !user.email || !user.mustChangePassword || !user.organizations.length) return null;
  const organizationId = user.organizations[0].organizationId;
  if (user.organizations.some(member => member.organizationId !== organizationId || member.role !== 'DRIVER' || !member.active)) return null;
  if (await isPlatformIdentity(prisma, user.id)) return null;
  const [driver, store] = await Promise.all([
    prisma.driver.findFirst({ where: { userId: user.id, organizationId, active: true }, select: { id: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true, status: true } }),
  ]);
  return driver && store?.slug && !['SUSPENDED', 'CANCELLED'].includes(store.status) ? store.slug : null;
}

export async function getDriverInvitationStore(slug: string) {
  if (!slugValid(slug)) return null;
  const store = await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
  return store && !['SUSPENDED', 'CANCELLED'].includes(store.status) ? store : null;
}
async function invitedAccount(slug: string, email: string) {
  const store = await getDriverInvitationStore(slug);
  if (!store) return null;
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { organizations: true } });
  // A pending, owner-created driver profile is the invitation. The URL alone grants nothing.
  if (!user?.active || !user.email || !user.mustChangePassword || !user.organizations.length || user.organizations.some(m => m.organizationId !== store.id || m.role !== 'DRIVER' || !m.active)) return null;
  if (await isPlatformIdentity(prisma, user.id)) return null;
  const driver = await prisma.driver.findFirst({ where: { userId: user.id, organizationId: store.id, active: true }, select: { id: true } });
  return driver ? { store, user, driver } : null;
}
const prefix = (userId: string, email: string) => `driver:invite:${userId}:${driverTokenHash(email)}:`;

/** Public response must not reveal whether this email has an invitation. */
export async function requestDriverInvitation(slug: string, email: string, password: string) {
  if (!driverMailReady()) throw new OperationError('O convite está pendente; o envio de e-mail aguarda configuração pela plataforma.');
  const account = await invitedAccount(slug, email);
  if (!account) return;
  const token = randomBytes(32).toString('hex');
  const digest = driverTokenHash(token);
  const keyPrefix = prefix(account.user.id, account.user.email!);
  // Password remains a hash in an expiring token record until the owner of the email verifies it.
  const passwordHash = await hashPassword(password);
  const identifier = keyPrefix + passwordHash;
  const created = await withOrganizationTransaction(account.store.id, async tx => {
    const current = await tx.user.findUnique({ where: { id: account.user.id }, include: { organizations: true } });
    const driver = await tx.driver.findFirst({ where: { id: account.driver.id, organizationId: account.store.id, userId: account.user.id, active: true }, select: { id: true } });
    if (!driver || !current?.active || !current.mustChangePassword || current.email !== account.user.email || current.organizations.some(m => m.organizationId !== account.store.id || m.role !== 'DRIVER' || !m.active) || await isPlatformIdentity(tx, current.id)) return false;
    const pending = await tx.verificationToken.findFirst({ where: { identifier: { startsWith: keyPrefix }, expires: { gt: new Date() } } });
    if (pending) return false;
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: keyPrefix } } });
    await tx.verificationToken.create({ data: { identifier, token: digest, expires: new Date(Date.now() + 30 * 60 * 1000) } });
    return true;
  });
  if (!created) return;
  const url = new URL('/entregador/acesso', process.env.APP_PUBLIC_URL!);
  url.hash = new URLSearchParams({ acao: 'invite', usuario: account.user.id, loja: slug, token }).toString();
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ from: process.env.MAIL_FROM, to: [account.user.email], subject: `Confirme seu acesso de entregador · ${account.store.name}`, text: `Você escolheu uma senha para trabalhar como entregador de ${account.store.name} no Del Flash. Confirme seu e-mail: ${url.toString()}\n\nO link vale por 30 minutos e só pode ser usado uma vez. Sua senha ainda não foi ativada. Se não solicitou, ignore este e-mail.` }) });
    if (!response.ok) throw new Error('MAIL_FAILED');
  } catch {
    await prisma.verificationToken.deleteMany({ where: { identifier, token: digest } });
    throw new OperationError('Não foi possível enviar o e-mail. O convite continua pendente; tente novamente mais tarde.');
  }
}

export async function consumeDriverInvitation(slug: string, userId: string, token: string) {
  const invalid = () => new OperationError('Convite inválido, expirado ou já utilizado. Solicite um novo link à sua loja.');
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalid();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const account = user?.email ? await invitedAccount(slug, user.email) : null;
  if (!account || account.user.id !== userId) throw invalid();
  const keyPrefix = prefix(userId, account.user.email!);
  await withOrganizationTransaction(account.store.id, async tx => {
    const current = await tx.user.findUnique({ where: { id: userId }, include: { organizations: true } });
    const driver = await tx.driver.findFirst({ where: { id: account.driver.id, organizationId: account.store.id, userId, active: true }, select: { id: true } });
    const store = await tx.organization.findUnique({ where: { id: account.store.id }, select: { status: true } });
    if (!driver || !store || ['SUSPENDED', 'CANCELLED'].includes(store.status) || !current?.active || !current.mustChangePassword || current.email !== account.user.email || current.organizations.some(m => m.organizationId !== account.store.id || m.role !== 'DRIVER' || !m.active) || !current.organizations.length || await isPlatformIdentity(tx, userId)) throw invalid();
    const row = await tx.verificationToken.findFirst({ where: { identifier: { startsWith: keyPrefix }, token: driverTokenHash(token), expires: { gt: new Date() } } });
    if (!row) throw invalid();
    const passwordHash = row.identifier.slice(keyPrefix.length);
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash)) throw invalid();
    const used = await tx.verificationToken.deleteMany({ where: { identifier: row.identifier, token: row.token, expires: { gt: new Date() } } });
    if (used.count !== 1) throw invalid();
    await tx.user.update({ where: { id: userId }, data: { passwordHash, emailVerified: new Date(), mustChangePassword: false } });
    for (const mode of ['activate', 'reset', 'invite']) await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `driver:${mode}:${userId}:` } } });
    await revokeDriverSessions(tx, account.store.id, userId);
    await tx.notification.create({ data: { organizationId: account.store.id, userId, type: 'SYSTEM', title: 'Convite de entregador confirmado', message: 'O titular confirmou o e-mail e ativou a senha escolhida no convite da loja.' } });
  });
}
