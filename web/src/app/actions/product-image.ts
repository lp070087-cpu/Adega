'use server';
import { OperationError } from '@/lib/operation-error';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { getStorage, validateUploadBytes } from '@/lib/storage';
export async function uploadProductImageAction(form: FormData) {
  try {
    const { organizationId } = await requirePermission('MANAGE_PRODUCTS');
    const file = form.get('file');
    if (!(file instanceof File)) throw new OperationError('Selecione uma imagem.');
    if (file.size > 3 * 1024 * 1024) throw new OperationError('A imagem deve ter até 3 MB.');
    const bytes = Buffer.from(await file.arrayBuffer());
    validateUploadBytes(bytes, file.type);
    const storage = getStorage();
    if (!storage.isConfigured()) throw new OperationError('Envio de arquivos indisponível. Use uma URL ou foto do catálogo.');
    const result = await storage.upload(bytes, { filename: file.name, contentType: file.type, folder: `organizations/${organizationId}/products` });
    return { ok: true as const, url: result.url };
  } catch (error) { return { ok: false as const, error: toActionError(error).error }; }
}
