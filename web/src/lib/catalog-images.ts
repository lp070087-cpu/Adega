/**
 * ═══════════════════════════════════════════════════════════════════════
 * IMAGENS DO CATÁLOGO — resolução de caminho
 * -----------------------------------------------------------------------
 * O banco guarda CAMINHO RELATIVO ("bebidas/refrigerantes/coca-cola.webp"),
 * nunca URL absoluta.
 *
 * Motivo: um dia essas imagens podem sair de /public e ir para uma CDN.
 * Se o banco guardasse "https://plataforma.com/catalog/...", essa migração
 * viraria um UPDATE em milhares de linhas. Guardando caminho, muda-se só
 * a base aqui.
 *
 * Também resolve a precedência de imagem do produto da loja:
 *   1. customImageUrl  → foto que o lojista subiu/trocou
 *   2. defaultImageUrl → imagem global (compartilhada, não duplicada)
 *   3. emoji           → reserva, quando ainda não há arquivo no acervo
 *
 * ── Sobre a falta de extensão (importante) ──
 * `seedImagePath()` grava `defaultImageUrl` SEM extensão, de propósito:
 * derivar o caminho do produto significa que baixar o arquivo para o
 * lugar certo já basta para a foto aparecer — sem UPDATE no banco. O
 * preço disso é que quem for montar a URL precisa TENTAR as extensões.
 * É o que `catalogImageCandidates()` faz, e ninguém mais deve montar URL
 * de acervo à mão.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { slugify } from '@/lib/utils';

/** Base pública das imagens do acervo. Trocar aqui para usar CDN. */
export const CATALOG_BASE_PATH = '/catalog';

/** Extensões aceitas no acervo, na ordem em que são procuradas. */
export const CATALOG_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'] as const;

/** Uma das extensões conhecidas do acervo. */
const EXTENSION_RE = /\.(webp|jpe?g|png|avif|gif|svg)$/i;

/** A base do acervo como prefixo de caminho (ex.: `/catalog/`). */
const BASE_PREFIX_RE = new RegExp(`^${CATALOG_BASE_PATH}/`, 'i');

/** Valor que não passa pelo acervo: URL de rede ou data URL. */
function isExternalSource(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('//') || /^data:/i.test(value);
}

/**
 * Deixa o valor no formato canônico do acervo: caminho relativo, SEM barra
 * inicial, SEM o prefixo `catalog/`.
 *
 * É esta função — e não cada componente — que sabe que
 * `bebidas/x/foto` (o que o banco guarda) e `/catalog/bebidas/x/foto.jpeg`
 * (o que o disco tem) são a mesma coisa. Sem ela, um `catalog/...` gravado
 * no banco virava `/catalog/catalog/...` e um caminho absoluto virava
 * `/catalog//catalog/...`.
 */
export function normalizeCatalogRelativePath(raw: string): string {
  let path = raw.trim();

  // O prefixo do ARMAZENAMENTO — pode ser `catalog/` ou `/catalog/`.
  path = path.replace(/^\/?catalog\//i, '');
  // A barra do caminho (se sobrou).
  path = path.replace(/^\/+/, '');

  return path;
}

/**
 * Expande um caminho RELATIVO do acervo nas extensões aceitas. Se ele já
 * tiver extensão, devolve o arquivo exato — sem expandir, senão um `.png`
 * apontado de propósito apareceria como `.webp` antes.
 */
function expandRelative(relative: string): string[] {
  const clean = normalizeCatalogRelativePath(relative);
  if (!clean) return [];
  if (EXTENSION_RE.test(clean)) return [`${CATALOG_BASE_PATH}/${clean}`];
  return CATALOG_EXTENSIONS.map((extension) => `${CATALOG_BASE_PATH}/${clean}${extension}`);
}

/**
 * Monta a URL pública a partir do caminho relativo guardado no banco.
 *
 * Aceita também URL absoluta (banner/foto enviada pelo lojista) e caminho
 * já servível, e devolve como está — assim a mesma função serve para os
 * dois casos.
 *
 * ATENÇÃO: se o caminho NÃO tiver extensão, o valor devolvido aponta para
 * um arquivo que provavelmente não existe (o acervo não guarda arquivo
 * sem extensão). Para isso existe `catalogImageCandidates()`.
 */
export function catalogImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  // URL de rede ou data URL: devolve sem tocar.
  if (isExternalSource(trimmed)) return trimmed;

  const relative = normalizeCatalogRelativePath(trimmed);
  if (!relative) return null;

  return `${CATALOG_BASE_PATH}/${relative}`;
}

/**
 * Todos os arquivos que uma referência do acervo pode apontar, na ordem em
 * que devem ser tentados — porque o banco guarda o caminho SEM extensão.
 *
 *   catalogImageCandidates('bebidas/cervejas/heineken-lata-350ml')
 *   → ['/catalog/bebidas/cervejas/heineken-lata-350ml.webp',
 *      '/catalog/bebidas/cervejas/heineken-lata-350ml.jpg',
 *      '/catalog/bebidas/cervejas/heineken-lata-350ml.jpeg',
 *      '/catalog/bebidas/cervejas/heineken-lata-350ml.png']
 *
 * Se a referência JÁ tem extensão, devolve um candidato só: o arquivo
 * exato. Expandir aqui seria errado — se o lojista apontou para um .png
 * específico, tentar .webp antes mostraria a imagem errada.
 *
 * URL completa (`https://…`) e caminho absoluto (`/uploads/…`) devolvem um
 * candidato só, porque não passam pelo acervo.
 */
export function catalogImageCandidates(path: string | null | undefined): string[] {
  if (!path) return [];
  const trimmed = path.trim();
  if (!trimmed) return [];

  // URL de rede ou data URL: candidato único, não passa pelo acervo.
  if (isExternalSource(trimmed)) return [trimmed];

  // Um caminho que COMEÇA com a base do acervo é inequivocamente do acervo,
  // então é normalizado e expandido como qualquer outro caminho relativo.
  // Isto não muda nada para os banners (`/catalog/banners/x.png` já tem
  // extensão e sai idêntico) e faz `/catalog/bebidas/x/foto` — sem
  // extensão — resolver, em vez de bater em 404.
  if (BASE_PREFIX_RE.test(trimmed)) return expandRelative(trimmed);

  // Qualquer outro caminho absoluto ("/uploads/logo.png", logo servido de
  // outra pasta) é servível como está. NÃO é tratado como caminho do
  // acervo: prefixar ou expandir aqui moveria um arquivo que não é do
  // catálogo para dentro de /catalog.
  if (trimmed.startsWith('/')) return [trimmed];

  return expandRelative(trimmed);
}

/**
 * Lista final de URLs a tentar para um produto, na ordem de precedência
 * documentada no topo desta arquivo, sem repetição.
 *
 * Existe para que a regra de precedência seja UMA só, no mesmo lugar da
 * regra de caminho. Antes cada componente montava a sua — e o
 * ProductThumb, sozinho, era o único dos seis consumidores que não
 * expandia a imagem global, que é justamente a que o catálogo global usa.
 */
export function productImageCandidates(input: {
  customImageUrl?: string | null;
  globalImageUrl?: string | null;
  imageUrl?: string | null;
  basePath?: string | null;
  preferBasePath?: boolean;
}): string[] {
  // Quando a base é uma VARIAÇÃO do produto (onboarding), a ordem natural
  // não serve: `globalImageUrl` e `basePath` são o mesmo arquivo, e o
  // primeiro tentaria um palpite pelas extensões antes do nome exato.
  const ordered = input.preferBasePath
    ? [input.customImageUrl, input.basePath, input.globalImageUrl, input.imageUrl]
    : [input.customImageUrl, input.globalImageUrl, input.imageUrl, input.basePath];

  return Array.from(new Set(ordered.flatMap((source) => catalogImageCandidates(source))));
}

/**
 * Imagem efetiva de um produto da loja, com a precedência documentada.
 *
 * A imagem personalizada é descartada se, por algum motivo, vier vazia —
 * nesse caso o produto volta sozinho para a imagem global. É o
 * comportamento pedido: remover a foto própria reverte para a padrão.
 *
 * Devolve o PRIMEIRO candidato. Quem precisa tolerar arquivo ausente deve
 * usar `productImageCandidates()`, que devolve a lista inteira.
 */
export function resolveProductImage(input: {
  customImageUrl?: string | null;
  globalImageUrl?: string | null;
  imageUrl?: string | null;
  basePath?: string | null;
}): string | null {
  return productImageCandidates(input)[0] ?? null;
}

/**
 * O produto tem foto própria (e portanto não depende da global)?
 * Usado na UI para mostrar o selo "imagem personalizada".
 */
export function hasCustomImage(product: { customImageUrl?: string | null }): boolean {
  return Boolean(product.customImageUrl && product.customImageUrl.trim());
}

/**
 * Caminho do arquivo dentro do acervo, montado a partir da categoria e do
 * nome. É o que o script de importação de imagens usa para adivinhar onde
 * o arquivo deve estar — e o que a documentação recomenda como convenção.
 *
 *   buildCatalogPath('bebidas/refrigerantes', 'Coca-Cola 350ml')
 *   → 'bebidas/refrigerantes/coca-cola-350ml'
 */
export function buildCatalogPath(categoryPath: string, name: string): string {
  // Mesmo slugify do resto do sistema: nome de arquivo e slug de produto
  // não podem divergir, senão a busca por imagem falha em silêncio.
  const folder = categoryPath.replace(/^\/+|\/+$/g, '');
  const file = slugify(name) || 'produto';
  return folder ? `${folder}/${file}` : file;
}

/**
 * Candidatos de caminho para um produto montado a partir da categoria e do
 * nome (não a partir de referência já guardada).
 *
 * Existe porque o acervo real tem variações de nome que não dá para
 * prever: "coca-cola-350ml.jpg" e "coca-cola-350ml.webp" são o mesmo item.
 * A UI pode tentar em ordem e ficar com o primeiro que carregar, sem
 * precisar de nenhuma checagem no servidor.
 */
export function catalogImageCandidatesForName(categoryPath: string, name: string): string[] {
  return expandRelative(buildCatalogPath(categoryPath, name));
}

/**
 * Pasta de imagens de uma categoria global.
 * Nível raiz: "bebidas". Folha: "bebidas/cervejas".
 */
export function globalCategoryImagePath(
  category: { slug: string; parent?: { slug: string } | null },
): string {
  return category.parent ? `${category.parent.slug}/${category.slug}` : category.slug;
}
