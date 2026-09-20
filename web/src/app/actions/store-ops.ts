'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import * as storeOps from '@/lib/data/store-ops';
import { summarizeSchedule } from '@/lib/schedule';
import { idSchema } from '@/lib/validations/common';
import {
  saveDeliverySchema,
  saveScheduleSchema,
  saveVisualIdentitySchema,
  storeBannerInputSchema,
  deliveryZoneSchema,
} from '@/lib/validations/store-ops';
import { getStorage, validateImageUrl } from '@/lib/storage';
import { validateBannerFile } from '@/lib/banner-image';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * OPERAÇÃO DA LOJA — server actions (Fase 4)
 * -----------------------------------------------------------------------
 * Horários, entrega, aparência e banners. Cada ação declara a permissão
 * que exige e lê a organização da SESSÃO. Nenhuma delas aceita
 * organizationId, nem por parâmetro nem por formulário.
 *
 * Sobre `validateImageUrl`: ela LANÇA em `data:` e em esquema não-http(s).
 * Zod aceita `data:` como URL válida, então a barreira contra base64 no
 * banco é essa — e por isso cada chamada é envolvida em try/catch e vira
 * mensagem. Deixar a exceção subir derrubaria a action inteira e a tela
 * ficaria presa em "salvando".
 * ═══════════════════════════════════════════════════════════════════════
 */

export type OpsActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

function firstIssue(error: z.ZodError): { error: string; field?: string } {
  const issue = error.errors[0];
  return { error: issue?.message ?? 'Dados inválidos.', field: issue?.path[0] as string };
}

function revalidateStore() {
  revalidatePath('/app/minha-loja');
  revalidatePath('/app/horarios');
  revalidatePath('/app/entrega');
  revalidatePath('/app/aparencia');
  revalidatePath('/app/banners');
  revalidatePath('/app/dashboard');
  revalidatePath('/loja', 'layout');
}

// ── HORÁRIOS (4.23) ────────────────────────────────────────────────────

/**
 * A agenda é a fonte única: o texto legível de `openingHours` é DERIVADO
 * dela. Quando os dois existiam soltos, a vitrine podia anunciar um
 * horário e a agenda dizer outro.
 */
export async function saveScheduleAction(input: unknown): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = saveScheduleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const summary = summarizeSchedule(parsed.data.schedule);
    await storeOps.saveSchedule(organizationId, parsed.data.schedule, summary ?? '');

    revalidateStore();
    return { ok: true, data: { summary } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── ENTREGA (4.22) ─────────────────────────────────────────────────────

export async function saveDeliveryAction(input: unknown): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = saveDeliverySchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await storeOps.saveDelivery(organizationId, parsed.data);
    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── BAIRROS E TAXAS (Fase 3) ─────────────────────────────────────────────
//
// Mesma regra dos banners: organização vem da sessão, nunca do formulário,
// e toda escrita por id de zona leva `organizationId` no where — atualizar
// por `{ id }` sozinho permitiria editar o bairro de outra loja.

export async function createDeliveryZoneAction(input: unknown): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = deliveryZoneSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await storeOps.createDeliveryZone(organizationId, parsed.data);
    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateDeliveryZoneAction(
  zoneId: string,
  input: unknown,
): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const id = z.object({ zoneId: idSchema }).safeParse({ zoneId });
    if (!id.success) return { ok: false, ...firstIssue(id.error) };

    const parsed = deliveryZoneSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await storeOps.updateDeliveryZone(organizationId, id.data.zoneId, parsed.data);
    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function deleteDeliveryZoneAction(zoneId: string): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const parsed = z.object({ zoneId: idSchema }).safeParse({ zoneId });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await storeOps.deleteDeliveryZone(organizationId, parsed.data.zoneId);
    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── APARÊNCIA (4.21) ───────────────────────────────────────────────────

export async function saveVisualIdentityAction(input: unknown): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = saveVisualIdentitySchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    let logo: string | null = null;
    try {
      logo = parsed.data.logoUrl ? validateImageUrl(parsed.data.logoUrl) : null;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Endereço da logo inválido.',
        field: 'logoUrl',
      };
    }

    await storeOps.saveVisualIdentity(organizationId, {
      brandColor: parsed.data.brandColor,
      secondaryColor: parsed.data.secondaryColor ?? null,
      accentColor: parsed.data.accentColor ?? null,
      theme: parsed.data.theme,
      logoUrl: logo,
    });

    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── BANNERS (4.19) ─────────────────────────────────────────────────────

export async function createBannerAction(input: unknown): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = storeBannerInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    let image: string | null;
    try {
      image = validateImageUrl(parsed.data.imagePath);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Endereço da imagem inválido.',
        field: 'imagePath',
      };
    }
    if (!image) {
      return { ok: false, error: 'Informe o endereço da imagem do banner.', field: 'imagePath' };
    }

    await storeOps.createStoreBanner(organizationId, {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? null,
      imagePath: image,
      linkUrl: parsed.data.linkUrl || null,
      active: parsed.data.active,
    });

    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function updateBannerAction(
  bannerId: string,
  input: unknown,
): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const id = z.object({ bannerId: idSchema }).safeParse({ bannerId });
    if (!id.success) return { ok: false, ...firstIssue(id.error) };

    const parsed = storeBannerInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    let image: string | null;
    try {
      image = validateImageUrl(parsed.data.imagePath);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Endereço da imagem inválido.',
        field: 'imagePath',
      };
    }
    if (!image) {
      return { ok: false, error: 'Informe o endereço da imagem do banner.', field: 'imagePath' };
    }

    await storeOps.updateStoreBanner(organizationId, id.data.bannerId, {
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? null,
      imagePath: image,
      linkUrl: parsed.data.linkUrl || null,
      active: parsed.data.active,
    });

    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function toggleBannerAction(input: {
  bannerId: string;
  active: boolean;
}): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = z
      .object({ bannerId: idSchema, active: z.boolean() })
      .safeParse(input);
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    await storeOps.toggleStoreBanner(organizationId, parsed.data.bannerId, parsed.data.active);
    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function deleteBannerAction(bannerId: string): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');

    const parsed = z.object({ bannerId: idSchema }).safeParse({ bannerId });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    // Só apaga banner DA LOJA. O banner padrão da plataforma tem
    // organizationId nulo e não é alcançável por este caminho.
    await storeOps.deleteStoreBanner(organizationId, parsed.data.bannerId);

    revalidateStore();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

export async function reorderBannersAction(ids: string[]): Promise<OpsActionResult> {
  try {
    const { organizationId } = await requirePermission('MANAGE_SETTINGS');
    const parsed = z.object({ ids: z.array(idSchema).min(1).max(50) }).safeParse({ ids });
    if (!parsed.success) return { ok: false, ...firstIssue(parsed.error) };

    const result = await storeOps.reorderStoreBanners(organizationId, parsed.data.ids);
    revalidateStore();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}

// ── UPLOAD DE IMAGEM DE BANNER (Fase 2) ─────────────────────────────────
//
// REGRA 7: o banner deixou de ser "cole uma URL" para ser "envie o
// arquivo". O arquivo sobe pelo adapter de storage (`getStorage`), que
// continua sendo a única porta de entrada de binário — nenhum base64 vai
// para o banco e nenhum arquivo é gravado em disco local. Quando nenhum
// provedor está configurado, o adapter devolve erro claro e a tela mostra
// isso em vez de fingir sucesso.

// Formato e tamanho aceitos NÃO moram aqui: um módulo `'use server'` só
// pode exportar função assíncrona, e uma constante exportada daqui derruba
// a página inteira em runtime. As regras estão em `@/lib/banner-image`,
// que a tela do cliente importa também — assim o limite do aviso é
// literalmente o mesmo número que o servidor aplica.

export async function uploadBannerImageAction(
  formData: FormData,
): Promise<OpsActionResult<{ url: string; provider: string }>> {
  try {
    await requirePermission('MANAGE_SETTINGS');

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Selecione um arquivo de imagem.', field: 'file' };
    }

    // Mesma checagem que a tela faz, com o mesmo texto — as duas leem o
    // limite de `@/lib/banner-image`. A da tela é atalho; esta é a que vale.
    const invalidFile = validateBannerFile(file);
    if (invalidFile) {
      return { ok: false, error: invalidFile, field: 'file' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await getStorage().upload(buffer, {
      filename: file.name || 'banner',
      contentType: file.type,
      folder: 'banners',
    });

    if (!upload?.url) {
      return { ok: false, error: 'O storage não devolveu a URL da imagem.', field: 'file' };
    }

    // A URL devolvida pelo storage ainda passa pela mesma barreira das
    // URLs manuais: nada de data:, só http(s). Defesa em profundidade.
    let url: string;
    try {
      url = validateImageUrl(upload.url) ?? '';
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'URL da imagem inválida.',
        field: 'file',
      };
    }
    if (!url) {
      return { ok: false, error: 'O storage devolveu uma URL vazia.', field: 'file' };
    }

    revalidateStore();
    return { ok: true, data: { url, provider: upload.provider } };
  } catch (error) {
    return { ok: false, ...toActionError(error) };
  }
}


