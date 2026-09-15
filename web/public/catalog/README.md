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
absoluta:

```
bebidas/refrigerantes/coca-cola-350ml.webp
```

A montagem do caminho final é feita por `src/lib/catalog-images.ts`
(`catalogImageUrl`). Assim `/catalog/...` pode virar
`https://cdn.suamarca.com/...` sem migration.

## Convenção de nome de arquivo

```
<slug-do-produto>[-<variante>].<ext>
```

- tudo minúsculo, sem acento, sem espaço (hífen no lugar)
- a variante distingue tamanhos do mesmo produto: `-350ml`, `-600ml`, `-2l`
- exemplo: `coca-cola-350ml.webp`, `coca-cola-600ml.webp`, `heineken-330ml.webp`

O nome do arquivo **não precisa** bater com o nome do produto no banco — é só
uma convenção para o acervo continuar navegável a olho nu.

## Formato e tamanho

- preferir `.webp` (ou `.jpg` para foto de produto)
- recortar em quadrado 1:1 para produto (a vitrine renderiza em quadrado)
- banners em 4:1
- manter em torno de 800×800 para produto: o acervo tem centenas de arquivos
  e a página carrega a lista inteira

## O que ainda NÃO está aqui

As imagens reais estão sendo baixadas por categoria e serão colocadas nesta
estrutura depois. **Nada foi inventado neste diretório**: os arquivos `.gitkeep`
existem apenas para as pastas serem versionadas.

Enquanto um produto não tiver arquivo, a interface usa o emoji de reserva
(`GlobalProduct.emoji`) — nunca uma imagem fictícia.

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
