/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGRAS DA IMAGEM DE BANNER — arquivo compartilhado
 * -----------------------------------------------------------------------
 * Formatos aceitos e tamanho máximo do banner vivem aqui porque DUAS
 * pontas precisam da mesma resposta:
 *
 *   1. o servidor (`uploadBannerImageAction`) — é ele quem decide;
 *   2. o cliente (`BannerManager`) — o mesmo número, para avisar antes de
 *      subir 8 MB por uma conexão de celular.
 *
 * Por que não ficam no arquivo da server action: um módulo `'use server'`
 * só pode exportar função assíncrona — exportar uma constante de lá quebra
 * a página em tempo de execução (`A "use server" file can only export
 * async functions, found object.`). Por que não ficam copiadas dos dois
 * lados: duas cópias do mesmo limite divergem, e a tela passa a aceitar o
 * que o servidor recusa.
 *
 * O aviso do cliente continua sendo conveniência; quem barra de verdade é
 * o servidor, que revalida formato e tamanho.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Formatos aceitos — os mesmos que o input do cliente anuncia. */
export const BANNER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** `accept` do <input type="file">, derivado da lista de cima. */
export const BANNER_ACCEPT_ATTR = BANNER_IMAGE_TYPES.join(',');

/** Nomes de formato legíveis — usados na mensagem de erro dos dois lados. */
export const BANNER_IMAGE_TYPE_LABEL = 'PNG, JPG, JPEG ou WEBP';

/** Tamanho máximo em bytes (5 MB). */
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;

/** O mesmo limite em texto, para mensagem de erro. Não recalcular à mão. */
export const BANNER_MAX_LABEL = `${BANNER_MAX_BYTES / (1024 * 1024)} MB`;

/** Confere formato e tamanho. Devolve a mensagem de erro, ou null se passa. */
export function validateBannerFile(file: { type: string; size: number }): string | null {
  if (!(BANNER_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `Formato não aceito. Envie ${BANNER_IMAGE_TYPE_LABEL}.`;
  }
  if (file.size > BANNER_MAX_BYTES) {
    return `Arquivo grande demais. O limite é ${BANNER_MAX_LABEL}.`;
  }
  return null;
}
