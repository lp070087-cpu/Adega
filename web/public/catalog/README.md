# Biblioteca de imagens do catálogo

Esta pasta é o **acervo central de imagens da plataforma**. Um arquivo aqui
serve todas as lojas que usarem aquele produto — não existe cópia por
segmento.

```
catalog/
  bebidas/          cervejas · refrigerantes · energeticos · aguas · sucos ·
                    drinks-prontos · whisky · vodka · gin · vinho ·
                    espumantes · cachaca · chopp
  alimentos/        hamburgueres · pizzas · hot-dog · porcoes · salgados ·
                    sobremesas · combos · acompanhamentos
  conveniencia/     chocolates · salgadinhos · doces · gelo · mercearia · outros
  banners/          bebidas · hamburgueria · pizzaria · restaurante · mercado ·
                    acai · lanchonete
```

## Por que a imagem não fica junto do produto

Coca-Cola 350ml é vendida por hamburgueria, pizzaria, restaurante, mercado,
conveniência e loja de bebidas. Se cada segmento tivesse a sua pasta, o mesmo
arquivo existiria seis vezes:

```
ERRADO                          CERTO
hamburgueria/coca-350.jpg       bebidas/refrigerantes/coca-cola-350ml.webp
pizzaria/coca-350.jpg           ↑ uma vez, referenciada por N lojas
restaurante/coca-350.jpg
mercado/coca-350.jpg
```

Com 500 lojas usando o mesmo refrigerante, a diferença é entre 1 arquivo e
500. O banco guarda só o **caminho** (`GlobalProduct.defaultImageUrl`), então
trocar de domínio ou plugar uma CDN depois não obriga a reescrever nada.

## Como o banco aponta para cá

`GlobalProduct.defaultImageUrl` guarda **caminho relativo**, nunca URL
absoluta — e **sem extensão**:

```
bebidas/refrigerantes/coca-cola-lata-350ml
```

O `SEM EXTENSÃO` não é descuido: o banco não sabe se o arquivo do acervo é
`.webp`, `.jpg` ou `.png`, e não vale uma consulta ao servidor só para
descobrir. Quem resolve isso é `ProductThumb` (`src/components/catalog/`),
que monta os candidatos em `CATALOG_EXTENSIONS` e fica com o primeiro que
carregar:

```
bebidas/refrigerantes/coca-cola-lata-350ml.webp   ← tentativa 1
bebidas/refrigerantes/coca-cola-lata-350ml.jpg    ← tentativa 2
bebidas/refrigerantes/coca-cola-lata-350ml.png    ← tentativa 3
```

**Consequência prática:** salvar o arquivo com QUALQUER uma das extensões
aceitas basta. Não é preciso rodar seed nem tocar no banco — a foto aparece
sozinha. O caminho final (`/catalog/...`) é montado por
`src/lib/catalog-images.ts` (`catalogImageUrl`), então trocar por
`https://cdn.suamarca.com/...` depois continua sendo uma linha de código.

## Convenção de nome de arquivo

```
<slug-do-produto>.<ext>
```

- tudo minúsculo, sem acento, sem espaço (hífen no lugar)
- o slug é o **nome do produto** passado por `slug()` — marca + volume já
  deixam o nome único dentro do acervo
- exemplo: `coca-cola-lata-350ml.webp`, `heineken-long-neck-330ml.webp`

Vale a regra de `seedSlug()`/`seedImagePath()` em `src/data/global-products.ts`.
São elas que mandam — não esta convenção escrita à mão. O motivo de não
repetir o cálculo aqui é que ele tem armadilhas que passam batido:

| Produto | Slug gerado | Por quê |
| --- | --- | --- |
| `Skol Litrão 1L` | `skol-litrao-1l` | acento cai |
| `Heineken 0.0 Lata 350ml` | `heineken-0-0-lata-350ml` | ponto vira hífen |
| `Gin Gordon’s London Dry 750ml` | `gin-gordon-s-london-dry-750ml` | apóstrofo tipográfico (’) vira hífen |

O nome do arquivo **não precisa** bater com o nome do produto no banco — é só
uma convenção para o acervo continuar navegável a olho nu.

## Formato e tamanho

- preferir `.webp` (ou `.jpg` para foto de produto)
- recortar em quadrado 1:1 para produto (a vitrine renderiza em quadrado)
- banners em 4:1
- manter em torno de 800×800 para produto: o acervo tem centenas de arquivos
  e a página carrega a lista inteira

## Como as fotos entram aqui

```bash
npm run catalog:map     # biblioteca-produtos/ → public/catalog/
```

O acervo recebido veio com nomes de fornecedor, que não dizem o que é o
produto:

```
Product_8517_7be09571-d8ed-486e-bad6-58ee843739be.jpeg
00008793_cc792286-6159-4db7-b369-c7dcfaac1617.jpeg
```

Quem diz o que é o produto é a **foto**. Por isso `scripts/build-catalog-map.ts`
carrega um mapa explícito `arquivo → nome do produto`, conferido imagem por
imagem — e o destino final é perguntado ao próprio `seedImagePath()`, não
escrito à mão. O script **só copia**: nada é movido ou apagado de
`biblioteca-produtos/`.

Ele também relata, a cada execução:

- quantos produtos da biblioteca ainda estão **sem foto** (mostram emoji)
- quais fotos do acervo **não correspondem a nenhum produto**
- nomes de produto escritos errado no mapa (falha alto, não grava em pasta inventada)

Enquanto um produto não tiver arquivo, a interface usa o emoji de reserva
(`GlobalProduct.emoji`) — nunca uma imagem fictícia, nunca um placeholder
genérico.

---

## Auditoria de duplicatas (preparada, não executada)

Quando o acervo estiver completo, os problemas a resolver são:

| Tipo | Como detectar |
| --- | --- |
| Arquivo byte a byte idêntico | hash SHA-256 do conteúdo |
| Mesma imagem em resoluções diferentes | percepção visual + dimensões |
| `produto.jpg` e `produto-1.jpg` | normalizar nome e comparar |
| Versões 96×96 e 256×256 do mesmo item | dimensões + nome base |
| Formatos repetidos (`.png` + `.webp`) | nome base sem extensão |

O script de limpeza (`scripts/catalog-audit.ts`) será escrito quando as
imagens chegarem. Ele deve **apenas relatar** — remoção é decisão humana,
porque duas fotos de Coca-Cola 350ml podem ser legitimamente diferentes
(lata nova vs. antiga).

Nada de OCR ou processamento pesado nesta fase.
