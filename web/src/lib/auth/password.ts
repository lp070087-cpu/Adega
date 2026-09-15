import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * Hash de senha. bcrypt com custo 12 (~250ms num servidor comum) —
 * suficiente para tornar inviável um ataque offline sem travar o login.
 *
 * A senha em texto puro NUNCA é gravada, logada ou enviada de volta.
 * Esta é a única porta de entrada e saída de senha do sistema.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    // Hash corrompido não deve derrubar o login com erro 500.
    return false;
  }
}

/**
 * Compara em tempo constante mesmo quando o usuário não existe.
 * Sem isso, o tempo de resposta revela quais e-mails estão cadastrados.
 */
export async function fakeVerify(plain: string): Promise<boolean> {
  await bcrypt.compare(
    plain,
    '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3LWm0oQZ0M8XQ8lQZ0M8XQ8lQZ0M8XQ',
  );
  return false;
}
