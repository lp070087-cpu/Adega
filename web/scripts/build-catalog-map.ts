/**
 * ═══════════════════════════════════════════════════════════════════════
 * MONTA O ACERVO — biblioteca-produtos/  →  public/catalog/
 * -----------------------------------------------------------------------
 * O acervo recebido veio com nomes de fornecedor, sem relação com a
 * convenção que o seed grava em GlobalProduct.defaultImageUrl:
 *
 *     Product_8517_7be09571-d8ed-486e-bad6-58ee843739be.jpeg
 *     00008793_cc792286-6159-4db7-b369-c7dcfaac1617.jpeg
 *
 * Nenhum desses nomes diz o que é o produto — quem diz é a FOTO. Por isso
 * o mapa abaixo é explícito e foi conferido imagem por imagem. Não há
 * adivinhação a partir do nome do arquivo, e nenhuma heurística que
 * "descubra" o produto por padrão de id.
 *
 * ── Por que o destino é o NOME do produto, e não o caminho ──
 * O caminho final é responsabilidade de `seedImagePath(seed)`, que junta
 * a pasta da categoria com o slug do nome. Escrever esses caminhos à mão
 * aqui seria duplicar a regra — e errar. Exemplos de armadilha:
 *
 *   'Skol Litrão 1L'          → skol-litrao-1l        (ã vira a)
 *   'Heineken 0.0 Lata 350ml' → heineken-0-0-lata-350ml (ponto vira hífen)
 *   'Gin Gordon’s London Dry'  → gin-gordon-s-...      (apóstrofo vira hífen)
 *
 * Aquele apóstrofo é tipográfico (’), não ASCII: o slug ganha um "-s"
 * solto. À mão isso passaria batido; perguntando ao seed, não.
 *
 * Então este script NÃO sabe montar caminho nenhum. Ele só diz "a foto X
 * é o produto Y", procura Y na biblioteca real e pergunta ao seed onde Y
 * mora. Se o nome não existir, o script falha alto em vez de gravar
 * arquivo em pasta inventada.
 *
 * ── Só COPIA ──
 * Nada é movido nem apagado de biblioteca-produtos/. Rodar de novo é
 * seguro: sobrescreve os mesmos destinos com o mesmo conteúdo.
 *
 * Uso:  npm run catalog:map
 * ═══════════════════════════════════════════════════════════════════════
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import {
  GLOBAL_PRODUCT_SEEDS,
  findDuplicateSlugs,
  seedImagePath,
  type GlobalProductSeed,
} from '../src/data/global-products';

const WEB = process.cwd();
const SOURCE_DIR = join(WEB, 'biblioteca-produtos');
const TARGET_DIR = join(WEB, 'public', 'catalog');

/**
 * Arquivo do acervo (nome SEM extensão)  →  nome EXATO do produto na
 * biblioteca. O nome tem de bater com o campo `n` de
 * src/data/global-products.ts, caractere por caractere.
 *
 * Um produto só entra aqui se a foto mostrar exatamente aquele produto.
 * Vale mais um card com emoji do que um card com a foto errada.
 */
const IMAGE_MAP: Record<string, string> = {
  // TODAS as chaves vão entre aspas — inclusive as que começam com letra.
  // Os nomes do fornecedor têm hífen (`Product_8517_7be09571-d8ed-...`), e
  // hífen não é caractere válido em chave de objeto sem aspas: o parser lê
  // `Product_8517_7be09571`, encontra o `-` e aborta com
  // 'Expected "}" but found "-"'. Vale para qualquer chave que não seja um
  // identificador JS puro. Aspas aqui não custam nada e evitam a classe
  // inteira de erro.

  // ── Cervejas ────────────────────────────────────────────────────────
  // Foto é a lata de 473ml; o produto da biblioteca é a de 350ml — mesma
  // linha Brahma Chopp, então serve. Fica registrado que o volume difere.
  'Product_8517_7be09571-d8ed-486e-bad6-58ee843739be': 'Brahma Chopp Lata 350ml',
  'Product_16652_c9f6e250-8c73-451c-90a4-63a4fcb88041': 'Spaten Long Neck 355ml',
  'Product_12884_d539af7a-3b8e-448e-a41f-e529f683f247': 'Spaten Lata 350ml',
  '00009991_73e9b9f8-3d70-4136-80b3-28373f62c841': 'Heineken Lata 350ml',
  '00009993_eab7024b-af50-4895-833f-66a092a1e0a4': 'Heineken Long Neck 330ml',
  '00017090_b12ef4dd-8515-4021-9388-a435c80aa390': 'Heineken 0.0 Lata 350ml',
  '00008793_cc792286-6159-4db7-b369-c7dcfaac1617': 'Budweiser Long Neck 330ml',
  'Product_8579_38c2590f-a62c-4773-91dd-37b69f3c25fd': 'Budweiser Lata 350ml',
  'Product_9132_2f403a40-880b-4cdc-a611-f54784d7f8d0': 'Corona Extra Long Neck 330ml',
  'Product_17540_97b3d72b-366d-45cc-9ce5-f9208e55dcfe': 'Corona Extra Lata 350ml',
  'Product_9876_d1b92c28-fe86-4e8c-b2bf-3f364b50163c': 'Stella Artois Long Neck 275ml',
  'Product_26894_ca2b8da7-11f3-4fad-908a-ac8fd1f2bd30': 'Stella Artois Lata 350ml',
  'Product_8753_6d866c7f-a71c-46fa-9d39-14561549b110': 'Skol Litrão 1L',
  'Product_8771_a943eadd-ced3-4281-a9e3-25055b8d4253': 'Original Garrafa 600ml',
  'f71ace83-original-lata-473ml': 'Original Lata 350ml',
  '00027292_a2eae1d8-c122-482d-8758-c38f4c8a8dd6': 'Amstel Lata 350ml',
  'Product_90571_ae3ad9dc-7ec3-437f-a628-db8e7f2b7cbe': 'Skol Fardo 12 Latas 350ml',
  'Product_38145_510c6fea-171c-4154-ab3a-8fa94ee6b46e': 'Brahma Fardo 12 Latas 350ml',

  // ── Refrigerantes ───────────────────────────────────────────────────
  'Product_8847_9b0f6934-abe2-4ca5-bd34-1a22e5c9f143': 'Guaraná Antarctica Lata 350ml',
  'Product_8884_c95b7363-df2e-49d4-82bd-8ce5fa484287': 'Guaraná Antarctica Garrafa 2L',
  'Product_8865_68403441-7e74-4171-85f6-84088aab3751': 'Guaraná Antarctica Zero Lata 350ml',
  'Product_8849_fa58a93c-69dc-4f02-96f4-16145e29e0df': 'Pepsi Lata 350ml',
  'Product_8885_ed654ef0-b03d-490b-ba07-2bac98e41e79': 'Pepsi Garrafa 2L',

  // ── Energéticos ─────────────────────────────────────────────────────
  '00009995_285ef712-485d-46e8-b0aa-b0244f867c36': 'Red Bull Lata 250ml',
  '00009997_d85f1ff7-17d4-414f-8796-4f001c6c1461': 'Red Bull Lata 355ml',
  '00009996_bff6300c-658c-4d80-9128-1475415ba4c9': 'Red Bull Sugarfree 250ml',
  '00011032_8e405f9b-1fe3-43a3-9616-256e3211c386': 'Red Bull Tropical 250ml',

  // ── Drinks prontos ──────────────────────────────────────────────────
  'Product_8599_fa856133-f262-4399-bb01-375c9d2b27ac': 'Skol Beats Senses 269ml',
  'Product_23434_58642e2f-3e2a-488d-9906-5772682be91f': 'Skol Beats Tropical 269ml',

  // ── Destilados ──────────────────────────────────────────────────────
  '00009144_afa5ff9c-7575-4121-a9ea-db4b2df9d520': 'Whisky Red Label 1L',
  '00009256_44437b1b-3523-4ab9-932b-35f0bb5df039': 'Whisky White Horse 1L',
  '00009152_ccba6af4-a8ff-4a96-8abc-17dc5b639b94': 'Vodka Smirnoff 998ml',
  '00009156_f45c38d9-53b4-4d03-b10a-ee9528b90cf6': 'Vodka Absolut Original 1L',
  '00009193_45db3497-b7ec-44d6-86df-df6bbc4f4579': 'Gin Gordon’s London Dry 750ml',
  '00009196_536c132e-f522-4af7-9ec2-6cf196c0c2b8': 'Gin Tanqueray London Dry 750ml',

  // ── Vinhos e espumantes ─────────────────────────────────────────────
  '00009553_1c44f50b-d1c4-41f6-8dda-3793d4139859': 'Vinho Tinto Casillero del Diablo 750ml',
  '00009894_43b5d954-5d42-4293-913c-45df5e4de32c': 'Vinho Tinto Concha y Toro Reservado 750ml',
  '00013785_e1c9fcc3-1902-42e7-880f-12545690886a': 'Vinho Português Vinho Verde 750ml',
  '00009311_8fc5fd09-82ba-4243-952f-22b05d185451': 'Espumante Salton Brut 750ml',

  // ── Conveniência ────────────────────────────────────────────────────
  '00009702_50936fc9-3ca9-4e01-80dd-5f20420f5a10': 'Chocolate Lacta Ao Leite 80g',
  '00009705_1b525e97-fd24-424e-ae0b-e6c1097ee9db': 'Chocolate Lacta Shot 40g',
  '00025978_5d5f899b-736f-448c-8986-0f8aafce9454': 'Salgadinho Doritos Queijo 140g',
};

/** Arquivos do acervo que não são produto e ficam fora do processo. */
const IGNORED_FILES = new Set(['category_novidades.png']);

function main(): void {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`✖ Pasta de origem não encontrada: ${SOURCE_DIR}`);
    process.exit(1);
  }

  // Mesma trava do seed. Se a biblioteca tem slug repetido, o seed aborta a
  // carga inteira — e as fotos iriam para o lugar errado sem ninguém notar.
  const duplicates = findDuplicateSlugs();
  if (duplicates.length > 0) {
    console.error(
      `✖ A biblioteca tem nome repetido: ${duplicates.join(', ')}\n` +
        '  Corrija src/data/global-products.ts antes de copiar o acervo.',
    );
    process.exit(1);
  }

  // Índice por nome de produto.
  // O tipo de retorno é anotado no callback de propósito: sem ele o
  // `.map()` infere `(string | GlobalProductSeed)[][]`, que não satisfaz o
  // `Iterable<readonly [K, V]>` do construtor do Map.
  const seedByName = new Map<string, GlobalProductSeed>(
    GLOBAL_PRODUCT_SEEDS.map((seed): [string, GlobalProductSeed] => [seed.n, seed]),
  );

  // Índice do acervo por nome-sem-extensão, fora as cópias " (1)".
  const sourceByStem = new Map<string, string>();
  for (const file of readdirSync(SOURCE_DIR)) {
    if (file.includes(' (1)')) continue;
    if (IGNORED_FILES.has(file)) continue;
    const stem = file.slice(0, file.length - extname(file).length);
    sourceByStem.set(stem, file);
  }

  const problems: string[] = [];
  const destinationsSeen = new Map<string, string>();
  let copied = 0;

  for (const [stem, productName] of Object.entries(IMAGE_MAP)) {
    const seed = seedByName.get(productName);
    if (!seed) {
      // Nome escrito errado ou produto que saiu da biblioteca.
      problems.push(`"${productName}" (arquivo ${stem}) não existe na biblioteca.`);
      continue;
    }

    const sourceFile = sourceByStem.get(stem);
    if (!sourceFile) {
      problems.push(`Arquivo do acervo não encontrado: ${stem}`);
      continue;
    }

    // O caminho vem do próprio seed — sem extensão, de propósito.
    const basePath = seedImagePath(seed);
    if (/\.(webp|jpe?g|png)$/i.test(basePath)) {
      problems.push(
        `"${productName}" tem extensão fixa em defaultImageUrl (${basePath}); ` +
          'a convenção do acervo é sem extensão.',
      );
      continue;
    }

    const previous = destinationsSeen.get(basePath);
    if (previous) {
      problems.push(`Duas fotos apontam para o mesmo produto (${productName}).`);
      continue;
    }
    destinationsSeen.set(basePath, stem);

    const extension = extname(sourceFile);
    const output = join(TARGET_DIR, `${basePath}${extension}`);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(join(SOURCE_DIR, sourceFile), output);
    copied++;
  }

  // Produtos da biblioteca que já esperam uma foto e ainda não têm arquivo.
  // É o retrato do que falta no acervo — não é erro, é pendência.
  const missingArt: string[] = [];
  for (const seed of GLOBAL_PRODUCT_SEEDS) {
    if (seed.i) continue;
    const basePath = seedImagePath(seed);
    if (destinationsSeen.has(basePath)) continue;
    missingArt.push(`${basePath}  (${seed.n})`);
  }

  // Arquivos do acervo que ninguém reivindicou.
  const claimed = new Set(Object.keys(IMAGE_MAP));
  const unclaimed = [...sourceByStem.keys()].filter((stem) => !claimed.has(stem)).sort();

  console.log(`\n📦 Acervo → public/catalog/\n`);
  console.log(`   Copiados:                       ${copied}`);
  console.log(`   Produtos sem foto ainda:        ${missingArt.length}`);
  console.log(`   Arquivos do acervo sem destino: ${unclaimed.length}`);

  if (problems.length > 0) {
    console.log(`\n⚠  ${problems.length} inconsistência(s) no mapa:`);
    for (const problem of problems) console.log(`   - ${problem}`);
  }

  if (missingArt.length > 0) {
    console.log(`\n   Sem arquivo no acervo (mostram emoji até a foto chegar):`);
    for (const item of missingArt) console.log(`     ${item}`);
  }

  if (unclaimed.length > 0) {
    console.log(`\n   Fotos do acervo sem produto correspondente na biblioteca:`);
    for (const item of unclaimed) console.log(`     ${item}`);
  }

  console.log('');

  if (problems.length > 0) process.exit(1);
}

main();
