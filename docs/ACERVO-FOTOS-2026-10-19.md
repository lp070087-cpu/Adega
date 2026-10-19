# Acervo de fotografias — 19/10/2026

Inventário local, sem escrita no Neon. Reproduzir na pasta `web`: `node --import tsx scripts/catalog-inventory.ts`. O resultado completo em `ACERVO-INVENTARIO.json` lista as categorias, as cópias byte a byte idênticas e os nomes de produtos do catálogo de referência sem correspondência exata. Esses números descrevem arquivos locais e o catálogo de referência do código; não representam produtos em uso por cada organização no banco.

## Contagem

| Diretório | Imagens | Observação |
| --- | ---: | --- |
| `web/biblioteca-produtos` | 221 | 207 conteúdos SHA256 distintos; 14 cópias byte a byte idênticas. Pares visualmente iguais podem ter metadados diferentes e não contam como duplicatas exatas. JPEG. |
| `Public produtos` | 14 | 10 fotos e 4 banners. JPEG, WebP e PNG. |
| `web/Banneres public` | 4 | Originais PNG preservados fora da publicação. |
| `web/public/catalog` | 50 | 46 fotos de produtos e 4 banners. JPEG, JPG, WebP e PNG; cerca de 9 MB. |

O manifesto final contém 43 nomes exatos: 41 dos 356 itens do catálogo de referência e os dois produtos Brahma do HTML aprovado. Os 315 itens de referência restantes mantêm a prioridade de foto personalizada/global e fallback quando não há fotografia correspondente. O acervo contém cervejas, refrigerantes, energéticos, drinks, gin, vodka, whisky, vinhos, chocolates e salgadinhos; não há fotografia exata para todos os produtos ou segmentos do catálogo.

## Alterações desta etapa

- Recuperada `Public produtos/skol.jpg`: o rótulo mostra **Skol garrafa 600 ml**, agora publicada com esse nome exato. Não é usada para a lata 350 ml.
- Recuperada a foto `00015851_fbad6713-ff5a-4107-8771-375546c96712 (1).jpeg`: rótulo **Lacta Oreo 80 g**, agora publicada com esse nome exato.
- Detectada **Brahma Chopp 473 ml** na foto anteriormente chamada `brahma-chopp-lata-350ml.jpeg`. Retirada do manifesto e da resolução; o arquivo histórico permanece preservado. Removida a associação incorreta no script de cópia.
- Removida do script de cópia a associação Lacta Shot 80 g → 40 g, já bloqueada pelo resolvedor.
- Nenhum seed, preço, estoque, descrição ou registro do banco foi alterado. Apenas duas fotografias adicionais foram copiadas para a publicação; o acervo original não foi duplicado integralmente.

## Produtos de referência

| Produto | Resultado |
| --- | --- |
| Heineken lata 350 ml | Foto pública com rótulo 350 ml, conferida visualmente. |
| Skol lata 350 ml | Não encontrada correspondência exata em toda a biblioteca e no acervo raiz. As latas douradas candidatas `Product_105144…` mostram **Zero Álcool**, o arquivo raiz é garrafa 600 ml, outros arquivos são fardos. Mantido fallback. |
| Brahma Litrão 1 L | Foto do HTML aprovado preservada, rótulo 1 L. |
| Brahma Litrinho 300 ml | Foto do HTML aprovado preservada; baixa resolução original. |

Os três arquivos públicos conhecidos com embalagem divergente permanecem fisicamente preservados, mas o resolvedor bloqueia sua utilização: Original 350 ml (foto 473 ml), Brahma Chopp 350 ml (foto 473 ml), Lacta Shot 40 g (foto 80 g).

## Validação

Os três testes de resolução de fotografias passaram por execução, cobrindo existência de cada arquivo, precedência da foto do estabelecimento, correspondência exata e bloqueio de variantes/volumes divergentes. A revisão utilizou folha de contato de todos os 207 conteúdos SHA256 únicos e abertura individual dos candidatos relevantes. Não houve teste de compra ou escrita em produção.
