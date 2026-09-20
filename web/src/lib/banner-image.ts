/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGRAS DA IMAGEM DE BANNER — arquivo compartilhado
 * -----------------------------------------------------------------------
 * Este arquivo responde às perguntas sobre a imagem de um banner, e por
 * isso é lido pelas DUAS pontas:
 *
 *   1. o servidor (`uploadBannerImageAction`, `createBannerAction`) — é
 *      ele quem decide;
 *   2. o cliente (`BannerManager`) — o mesmo número e a mesma lista de
 *      arquivos, para avisar antes de subir 8 MB por uma conexão de
 *      celular ou de oferecer uma opção que o servidor vai recusar.
 *
 * Por que não ficam no arquivo da server action: um módulo `'use server'`
 * só pode exportar função assíncrona — exportar uma constante de lá quebra
 * a página em tempo de execução (`A "use server" file can only export
 * async functions, found object.`). Por que não ficam copiadas dos dois
 * lados: duas cópias do mesmo limite divergem, e a tela passa a aceitar o
 * que o servidor recusa.
 *
 * ── Duas origens de imagem, uma regra só ──
 * A imagem de um banner pode vir de dois lugares:
 *
 *   • upload   → o arquivo sobe pelo storage e volta como URL https do
 *                Vercel Blob (fluxo antigo, inalterado);
 *   • acervo   → um arquivo que JÁ existe no repositório, em
 *                `public/catalog/banners/`, referenciado pelo caminho
 *                público `/catalog/banners/<arquivo>`.
 *
 * As duas são validadas por `validateBannerImagePath()`, que é a barreira
 * de verdade. `validateImageUrl()` continua como estava: ela vale para
 * toda imagem do sistema (logo, foto de produto) e NÃO foi afrouxada —
 * banner é que ganhou a regra própria, em vez de abrir a porta para todo
 * mundo.
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

// ─────────────────────────────────────────────────────────────────────────
// ACERVO PÚBLICO DE BANNERS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pasta pública onde vivem os arquivos do acervo. O caminho é o mesmo que
 * o navegador pede, porque `public/` é a raiz dos estáticos no Next.
 */
export const BANNER_LIBRARY_DIR = 'public/catalog/banners';

/** Como o caminho do acervo aparece no banco e no `src` da imagem. */
export const BANNER_LIBRARY_PREFIX = '/catalog/banners';

/**
 * Extensões que o acervo aceita. É o que barra `..`, barra final, `%2e%2e`
 * e qualquer coisa que não seja nome de arquivo — a checagem é de FORMA,
 * não uma lista de arquivos conhecidos. Por isso este arquivo não precisa
 * ser editado quando alguém acrescentar um banner novo à pasta.
 */
const BANNER_LIBRARY_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|jpe?g|png)$/i;

export type BannerLibraryItem = {
  /** Nome do arquivo, ex.: `banner-01.png`. */
  file: string;
  /** Caminho público, ex.: `/catalog/banners/banner-01.png`. */
  path: string;
  /** Rótulo curto para a tela, derivado do nome do arquivo. */
  label: string;
};

/**
 * ACERVO DISPONÍVEL HOJE.
 *
 * ── Por que esta lista existe ──
 * O componente que a consome é `'use client'`, roda no navegador, e não
 * tem acesso ao sistema de arquivos. Ler a pasta de verdade exigiria uma
 * API de listagem — e o pedido foi explícito: nada de API nova só para
 * listar diretório.
 *
 * ── O que isto NÃO é ──
 * Isto NÃO é uma regra do SaaS e NÃO limita o que o sistema aceita. Ao
 * gravar, quem manda é `validateBannerImagePath()`, que valida a FORMA do
 * caminho: `/catalog/banners/<qualquer-arquivo>.png` passa. Ou seja:
 * colocar um arquivo novo na pasta e apontá-lo já funciona no banco e na
 * vitrine, sem tocar em arquitetura nenhuma.
 *
 * — O QUE FALTA — para o arquivo novo aparecer TAMBÉM na lista da tela,
 * basta acrescentar o nome aqui embaixo. É a única edição necessária, e é
 * por isso que este array é o único lugar do código com nomes de arquivo.
 * Uma varredura de pasta em `next.config.ts` (`readdirSync`), gerando um
 * JSON consumido pela tela, seria o passo seguinte se a lista crescer
 * muito — mas isso é build-time e não vale a complexidade hoje.
 */
export const BANNER_LIBRARY_FILES: readonly string[] = [
  'banner-01.png',
  'banner-02.png',
  'banner-03.png',
  'banner-04.png',
];

/** `banner-01.png` → `Banner 01`. */
function labelFromBannerFile(file: string): string {
  const base = file.replace(/\.[A-Za-z0-9]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return file;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** O acervo pronto para a tela: arquivo, caminho público e rótulo. */
export const BANNER_LIBRARY: readonly BannerLibraryItem[] = BANNER_LIBRARY_FILES.map((file) => ({
  file,
  path: `${BANNER_LIBRARY_PREFIX}/${file}`,
  label: labelFromBannerFile(file),
}));

/**
 * O valor é um caminho do acervo, e não uma URL de rede?
 *
 * Aceita só a forma canônica (com a barra inicial). `catalog/banners/x.png`
 * sem barra não é reconhecido de propósito: no `src` de uma `<img>` ele
 * seria resolvido como caminho RELATIVO à página atual, ou seja, apontaria
 * para outro lugar — melhor recusar do que gravar algo que não carrega.
 */
export function isBannerLibraryPath(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.trim().startsWith(`${BANNER_LIBRARY_PREFIX}/`);
}

/**
 * Valida o endereço da imagem de um banner e devolve o valor canônico.
 *
 * Aceita DUAS coisas, e nada além delas:
 *
 *   • URL de rede  → `http://` ou `https://` (o que o storage devolve);
 *   • acervo       → `/catalog/banners/<nome>.<ext>`, com a extensão na
 *                    lista aceita e sem nenhum segmento `..` no meio.
 *
 * Recusa, com mensagem própria: `data:` (base64 no banco), esquema que não
 * seja http(s) (`javascript:`, `file:`, `blob:`), caminho arbitrário do
 * servidor (`/etc/passwd`, `/uploads/…`) e qualquer coisa que tente sair
 * da pasta do acervo.
 */
export function validateBannerImagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.length > 500) {
    throw new Error('Endereço da imagem muito longo.');
  }

  // Base64 no banco continua fora de questão — a mesma recusa de antes.
  if (/^data:/i.test(trimmed)) {
    throw new Error(
      'Imagem em base64 não é aceita. Envie o arquivo ou escolha uma imagem do acervo.',
    );
  }

  // Esquema com ":" antes da primeira barra é esquema de verdade
  // (`javascript:`, `file:`, `blob:`, `ftp:`…). Recusar aqui é o que
  // impede que um valor assim chegue ao `src` de uma <img>.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new Error('O endereço da imagem deve ser uma URL http(s) ou uma imagem do acervo.');
    }
    return trimmed;
  }

  if (isBannerLibraryPath(trimmed)) {
    const file = trimmed.slice(BANNER_LIBRARY_PREFIX.length + 1);
    // A forma do arquivo é a barreira: sem barra, sem `..`, sem `%`, sem
    // pasta — um nome simples com extensão conhecida, e nada mais.
    if (!BANNER_LIBRARY_FILE_RE.test(file)) {
      throw new Error(
        'Imagem do acervo inválida. Use /catalog/banners/<arquivo> com extensão .png, .jpg, .jpeg ou .webp.',
      );
    }
    return `${BANNER_LIBRARY_PREFIX}/${file}`;
  }

  // Sobrou: caminho relativo, absoluto de outra pasta, ou acervo sem a
  // barra inicial. Nenhum deles carrega a partir da vitrine.
  throw new Error(
    'Envie um arquivo pelo formulário, escolha uma imagem do acervo, ou informe uma URL http(s).',
  );
}
