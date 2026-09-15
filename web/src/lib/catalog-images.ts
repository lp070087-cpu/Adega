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
 * ═══════════════════════════════════════════════════════════════════════
 */

import { slugify } from '@/lib/utils';

/** Base pública das imagens do acervo. Trocar aqui para usar CDN. */
export const CATALOG_BASE_PATH = '/catalog';

/** Extensões aceitas no acervo, na ordem em que são procuradas. */
export const CATALOG_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'] as const;

/**
 * Monta a URL pública a partir do caminho relativo guardado no banco.
 * Aceita também URL absoluta (banner enviado pelo lojista) e devolve como
 * está — assim a mesma função serve para os dois casos.
 */
export function catalogImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;

  // Já é URL completa ou caminho absoluto: devolve sem tocar.
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;

  // Caminho relativo do acervo.
  return `${CATALOG_BASE_PATH}/${trimmed.replace(/^\/+/, '')}`;
}

/**
 * Imagem efetiva de um produto da loja, com a precedência documentada.
 *
 * A imagem personalizada é descartada se, por algum motivo, vier vazia —
 * nesse caso o produto volta sozinho para a imagem global. É o
 * comportamento pedido: remover a foto própria reverte para a padrão.
 */
export function resolveProductImage(input: {
  customImageUrl?: string | null;
  globalImageUrl?: string | null;
  imageUrl?: string | null;
}): string | null {
  return (
    catalogImageUrl(input.customImageUrl) ??
    catalogImageUrl(input.globalImageUrl) ??
    catalogImageUrl(input.imageUrl) ??
    null
  );
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
 * Candidatos de caminho para um produto, na ordem de preferência.
 *
 * Existe porque o acervo real tem variações de nome que não dá para
 * prever: "coca-cola-350ml.jpg" e "coca-cola-350ml.webp" são o mesmo item.
 * A UI pode tentar em ordem e ficar com o primeiro que carregar, sem
 * precisar de nenhuma checagem no servidor.
 */
export function catalogImageCandidates(categoryPath: string, name: string): string[] {
  const base = buildCatalogPath(categoryPath, name);
  return CATALOG_EXTENSIONS.map((extension) => catalogImageUrl(`${base}${extension}`)!);
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
