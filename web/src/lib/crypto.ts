import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRIPTOGRAFIA DE CREDENCIAIS DE INTEGRAÇÃO
 * -----------------------------------------------------------------------
 * AES-256-GCM. A chave vem de TOKEN_ENCRYPTION_KEY.
 *
 * Fail-closed: sem chave configurada, SALVAR falha de propósito.
 * Preferimos uma integração que não conecta a um segredo de terceiro
 * gravado em texto puro no banco.
 * ═══════════════════════════════════════════════════════════════════════
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM usa nonce de 96 bits
const VERSION = 'v1';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres). Gere com: openssl rand -base64 32',
    );
  }
  // Deriva 32 bytes exatos — a env pode vir em base64, hex ou texto.
  return createHash('sha256').update(raw).digest();
}

export function isEncryptionConfigured(): boolean {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  return Boolean(raw && raw.length >= 32);
}

/**
 * Formato do payload: v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 * O prefixo de versão permite rotacionar o algoritmo sem migração cega.
 */
export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Payload cifrado em formato desconhecido.');
  }
  const [, ivB64, tagB64, dataB64] = parts;

  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64!, 'base64'));
  // Sem o authTag o GCM não detecta adulteração do ciphertext.
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function encryptJson(value: Record<string, unknown>): string {
  return encrypt(JSON.stringify(value));
}

export function decryptJson<T = Record<string, unknown>>(payload: string): T {
  return JSON.parse(decrypt(payload)) as T;
}

/**
 * Máscara para exibir na interface. O valor real nunca sai do servidor:
 * a UI mostra "••••4821" e o lojista sabe qual credencial está lá sem
 * que o segredo trafegue.
 */
export function credentialHint(value: string): string {
  const clean = String(value ?? '');
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}
