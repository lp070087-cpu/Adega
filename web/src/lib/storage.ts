import 'server-only';
import { OperationError } from '@/lib/operation-error';
import { createHash, randomUUID } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * STORAGE — abstração de upload de imagem
 * -----------------------------------------------------------------------
 * Nesta fase guardamos apenas URL: nenhum binário entra no banco.
 * A demo antiga usava base64 no localStorage — isso NÃO é solução final
 * (cresce sem limite, não tem cache, não tem CDN e trafega em toda query).
 *
 * Para plugar um provedor real, implemente `upload()` e registre em
 * `getStorage()`. Nada mais no código precisa mudar.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type UploadResult = {
  url: string;
  provider: string;
};

export interface StorageAdapter {
  readonly name: string;
  /** true = pronto para receber upload. */
  isConfigured(): boolean;
  upload(file: Buffer, options: { filename: string; contentType: string; folder?: string }): Promise<UploadResult>;
}

/**
 * Adapter padrão desta fase: não faz upload.
 * Devolve erro claro em vez de fingir sucesso — a interface mostra
 * "Storage não configurado" e o lojista segue informando uma URL.
 */
class ManualUrlStorage implements StorageAdapter {
  readonly name = 'manual-url';

  isConfigured(): boolean {
    return false;
  }

  async upload(): Promise<UploadResult> {
    throw new OperationError(
      'Envio de arquivos indisponível. Use uma imagem do acervo ou informe a URL da imagem.',
    );
  }
}

/**
 * TODO (fase de storage):
 *   • Vercel Blob  → @vercel/blob, token em BLOB_READ_WRITE_TOKEN
 *   • Cloudinary   → cloudinary, URL em CLOUDINARY_URL
 *   • S3           → @aws-sdk/client-s3 + URL pré-assinada
 * Cada um vira uma classe implementando StorageAdapter.
 */
class VercelBlobStorage implements StorageAdapter {
  readonly name = 'vercel-blob';

  isConfigured(): boolean {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    return Boolean(token && token.length > 0);
  }

  async upload(file: Buffer, options: { filename: string; contentType: string; folder?: string }): Promise<UploadResult> {
    if (!this.isConfigured()) throw new OperationError('Envio de imagens não configurado.');
    validateUploadBytes(file, options.contentType);
    const folder = (options.folder ?? 'images').replace(/[^a-z0-9/_-]/gi, '');
    const extension = options.contentType === 'image/png' ? 'png' : options.contentType === 'image/webp' ? 'webp' : 'jpg';
    const { put } = await import('@vercel/blob');
    try {
      const result = await put(`${folder}/${randomUUID()}.${extension}`, file, { access: 'public', contentType: options.contentType, addRandomSuffix: false, cacheControlMaxAge: 60 * 60 * 24 * 365 });
      if (!/^https:\/\//.test(result.url)) throw new OperationError('O serviço não retornou uma imagem válida.');
      return { url: result.url, provider: this.name };
    } catch (error) {
      if (error instanceof OperationError) throw error;
      throw new OperationError('Não foi possível enviar a imagem. Tente novamente.');
    }
  }
}

let adapter: StorageAdapter = new ManualUrlStorage();
const vercelBlobStorage = new VercelBlobStorage();

class CloudinaryStorage implements StorageAdapter {
  readonly name = 'cloudinary';
  isConfigured() { return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET); }
  async upload(file: Buffer, options: { filename: string; contentType: string; folder?: string }): Promise<UploadResult> {
    if (!this.isConfigured()) throw new OperationError('Envio de imagens não configurado.');
    validateUploadBytes(file, options.contentType);
    const cloud = process.env.CLOUDINARY_CLOUD_NAME!;
    if (!/^[a-z0-9_-]+$/i.test(cloud)) throw new OperationError('Configuração de imagens inválida.');
    const folder = (options.folder ?? 'images').replace(/[^a-z0-9/_-]/gi, '');
    const params = { folder: `adega/${folder}`, public_id: randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)) };
    const signature = createHash('sha256').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + process.env.CLOUDINARY_API_SECRET!).digest('hex');
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.set(key, value);
    form.set('api_key', process.env.CLOUDINARY_API_KEY!); form.set('signature', signature);
    form.set('file', new Blob([new Uint8Array(file)], { type: options.contentType }), 'image');
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new OperationError('Não foi possível enviar a imagem. Tente novamente.');
    const data = await response.json() as { secure_url?: string };
    if (!data.secure_url?.startsWith(`https://res.cloudinary.com/${cloud}/`)) throw new OperationError('O serviço não retornou uma imagem válida.');
    return { url: data.secure_url, provider: this.name };
  }
}

export function validateUploadBytes(file: Buffer, contentType: string): void {
  if (!file.length || file.length > 5 * 1024 * 1024) throw new OperationError('A imagem deve ter até 5 MB.');
  const jpeg = file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  const png = file.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = file.toString('ascii', 0, 4) === 'RIFF' && file.toString('ascii', 8, 12) === 'WEBP';
  if (!(contentType === 'image/jpeg' && jpeg || contentType === 'image/png' && png || contentType === 'image/webp' && webp)) throw new OperationError('Use um arquivo JPEG, PNG ou WebP válido.');
}

export function getStorage(): StorageAdapter {
  if (process.env.STORAGE_PROVIDER === 'cloudinary') return new CloudinaryStorage();
  return vercelBlobStorage.isConfigured() ? vercelBlobStorage : adapter;
}

/** Troca o adapter (usado quando um provedor for plugado). */
export function setStorage(next: StorageAdapter): void {
  adapter = next;
}

export function storageStatus(): { provider: string; configured: boolean } {
  const current = getStorage();
  return { provider: current.name, configured: current.isConfigured() };
}

/**
 * Valida uma URL de imagem informada manualmente. Bloqueia data: URIs
 * (o caminho do base64 que estamos justamente abandonando) e esquemas
 * que não sejam http(s).
 */
export function validateImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) {
    throw new OperationError(
      'Imagem em base64 não é aceita. Envie o arquivo para um storage e informe a URL.',
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new OperationError('A URL da imagem deve começar com http:// ou https://');
  }
  if (trimmed.length > 500) {
    throw new OperationError('URL da imagem muito longa.');
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname || parsed.username || parsed.password) throw new OperationError('invalid');
  } catch {
    throw new OperationError('Informe uma URL de imagem válida, sem usuário ou senha.');
  }
  return trimmed;
}

