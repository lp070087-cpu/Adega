import 'server-only';

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
    throw new Error(
      'Storage de arquivos não configurado. Informe a URL da imagem ou configure um provedor (Vercel Blob, Cloudinary ou S3) em src/lib/storage.ts.',
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

  async upload(): Promise<UploadResult> {
    if (!this.isConfigured()) {
      throw new Error('Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN ausente).');
    }
    // TODO: implementar com @vercel/blob quando o upload real entrar.
    throw new Error('Upload para Vercel Blob ainda não implementado.');
  }
}

let adapter: StorageAdapter = new ManualUrlStorage();

export function getStorage(): StorageAdapter {
  return adapter;
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
    throw new Error(
      'Imagem em base64 não é aceita. Envie o arquivo para um storage e informe a URL.',
    );
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('A URL da imagem deve começar com http:// ou https://');
  }
  if (trimmed.length > 500) {
    throw new Error('URL da imagem muito longa.');
  }
  return trimmed;
}

export const vercelBlobStorage = new VercelBlobStorage();
