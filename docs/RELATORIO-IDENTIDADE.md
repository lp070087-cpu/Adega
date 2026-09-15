# RELATÓRIO — AJUSTE ESTRUTURAL DE IDENTIDADE

**Data:** 11/09/2026
**Escopo:** remover a identidade fixa "Adega" do produto. O sistema passa a ser uma
**plataforma de delivery multissegmento**, onde o nome e a logo exibidos são **sempre**
os do estabelecimento cadastrado pelo usuário.

**Não foi feito:** `git push`, deploy, nenhuma alteração na Vercel. Tudo local.
Os backups foram feitos **antes** das alterações (ver item A).

---

## A) ARQUIVOS ALTERADOS

| Arquivo | O que mudou |
|---|---|
| `loja-data.js` | `BUSINESS_COPY` (textos por segmento), `TENANT_NEUTRO`, `getTenant()` sem fallback para loja alheia, `iniciaisNome()` genérica, `TENANTS` demonstrativos sem Adega, `TEMPLATE_VAZIO`, `heroHeadline`/`heroDescricao` |
| `site.html` | 100% dirigido pelos dados do tenant: cards, promoções, combos, avaliações, rodapé, "Sobre", tela de loja inexistente, favicon, `document.title` |
| `plataforma.html` | Header/sidebar/login com o nome do estabelecimento, `document.title`, onboarding neutro, URL dinâmica, sem caso especial de id demo |
| `entregador.html` | Branding do tenant vinculado, `document.title`, catálogo de tenants compartilhado, iniciais iguais às do painel |
| `super-admin.html` | Seed de tenants demo sem Adega |
| `docs/RELATORIO-IDENTIDADE.md` | Este relatório |

**Backups criados antes de editar** (mesma pasta):

```
loja-data.js.bak-identidade-20260911
site.html.bak-identidade-20260911
plataforma.html.bak-identidade-20260911
entregador.html.bak-identidade-20260911
```

---

## B) ONDE EXISTIAM NOMES FIXOS

Auditoria feita por busca global (`Adega`, `Adega 1998`, `Adega Central`, `A98`,
`adega1998`, `adega-central`) antes de qualquer alteração:

| Arquivo | Ocorrência | Tipo |
|---|---|---|
| `site.html` | 8 cards de produto fixos (Heineken, Skol, Brahma Litrão, Brahma Litrinho, Smirnoff Ice, Jack Daniel's, Old Parr, Black Label), 2 cards de promoção + 4 de promoção secundária (Skol Beats, Tanqueray), 3 combos, pílulas de categoria, rodapé, "Sobre", avaliação 4.9 fixa | Conteúdo de loja no HTML |
| `site.html` | `getTenant()` caía em `adega1998` | Fallback de identidade |
| `plataforma.html` | `<div class="topbar-crumb">Adega 1998</div>`, `sideLogo`/`loginMark` = `D`, "Delivery Platform / Central Operacional", `obTipoSel='bebidas'`, `CURRENT.tenantId==='adega1998'` | Identidade fixa |
| `entregador.html` | `{id:'adega1998',nome:'Adega 1998',logo:'A98'}`, `getTenant()` → `getTenantCatalog()[0]`, "Delivery Platform" | Identidade fixa |
| `loja-data.js` | `TENANTS` com adega1998/adega-central, `inferType` devolvendo `'bebidas'` por padrão, `TEMPLATE_VAZIO` inexistente | Fallback de identidade |
| `super-admin.html` | tenant demo `adega1998` com `logo:'A98'` | Dados demo |
| `admin.html` | 20 ocorrências (título, login `A98`, e-mail demo, `adega_admin_logged`, `adega_caixa`…) | **Legado** |

---

## C) ONDE FORAM SUBSTITUÍDOS POR DADOS DINÂMICOS

**`site.html`** — nenhum nome, produto, preço, avaliação ou frase de segmento mora no
HTML. Tudo vem de `getTenant(?loja=ID)` + `lerProdutos(id)`:

- 9 cards de produto fixos → **removidos**; a grade nasce vazia e é montada por `renderProdutos()`
- 2 destaques de promoção + 4 cards → **removidos**; `renderPromos()` monta das promoções reais e **esconde a seção** se não houver
- 3 combos → **removidos**; `renderCombos()` usa os produtos da categoria "Combos" da loja
- pílulas de categoria → **removidas**; `renderCats()` deriva do catálogo real
- "4.9 ★★★★★ fixo" → `renderAvaliacoes()` calcula a média; sem avaliação, a seção sai da página
- rodapé, "Sobre", endereço, telefone, horário → todos do tenant
- "Ofertas com descontos de até 40%" → "Ofertas por tempo limitado" (o HTML não promete desconto que a loja não cadastrou)

**`plataforma.html`:**
- `pageCrumb` fixo → nome do estabelecimento atual
- `sideLogo` / `loginMark` fixos → logo enviada ou iniciais do nome
- "Delivery Platform / Central Operacional" → nome + categoria do estabelecimento
- `obTipoSel='bebidas'` → começa vazio; o assistente exige a escolha do segmento
- `CURRENT.tenantId==='adega1998'` → removido (nenhum id tem tratamento especial)

**`entregador.html`:** cabeçalho, tela de login, perfil e `document.title` com o nome e a
logo do estabelecimento ao qual o entregador está vinculado.

---

## D) COMO FUNCIONA A LOGO DINÂMICA

A logo exibida vem **sempre** de `ten.logoImg` (a imagem que o estabelecimento enviou em
**Minha Loja → Upload de logo**, guardada como data URL em `dp_tenant_{id}`).

Locais que usam a logo:
- site: header (`#headerLogoMark`), rodapé (`#footerLogoMark`), favicon (`renderFavicon()`)
- plataforma: login (`#loginMark`), sidebar (`#sideLogo`), card do tenant, pré-visualização em Minha Loja
- entregador: login (`#lgLogo`), cabeçalho do app (`#hdrLogo`)

A mesma função desenha a logo em todos eles (`logoDoTenant()` no painel, `logoHtml()` no
entregador, o bloco `[['headerLogoMark',…]]` no site), para nunca divergir. Ajustes de
enquadramento: `object-fit:contain` no site (não corta a marca), `cover` nos avatares
quadrados do painel/entregador.

**`A98` deixou de existir como fallback.** Não há nenhuma logo padrão de loja no código.

---

## E) COMO FUNCIONA O FALLBACK POR INICIAIS

Função única em `loja-data.js`, replicada (idêntica) em `entregador.html` porque esse app
não carrega o `loja-data.js`:

```js
function iniciaisNome(nome){
  const partes = String(nome||'').trim().split(/\s+/).filter(Boolean);
  if(!partes.length) return 'LO';
  const stop = ['do','da','de','dos','das','e'];
  const uteis = partes.filter(p => !stop.includes(p.toLowerCase()));
  const base  = uteis.length ? uteis : partes;
  const num   = base.find(p => /\d/.test(p));                 // regra do número
  if(num && base.length > 1) return (base[0][0] + num.replace(/\D/g,'')).toUpperCase().substring(0,3);
  if(base.length === 1) return base[0].substring(0,2).toUpperCase();
  return (base[0][0] + base[base.length-1][0]).toUpperCase();
}
```

Resultados: **Burger do Zé → BZ** · **Mercado Central → MC** · **Pizza Prime → PP** ·
**João Lanches → JL** · **Distribuidora Imperial → DI** · **Conveniência 24 Horas → C24**
(regra consistente: inicial + número; uma loja sem número com nome de uma palavra, ex.
"Bebidas", dá "BE") · **nome vazio → LO** (marca neutra do sistema, não de uma loja).

Não há nenhum tratamento especial para "Adega 1998" — nem para nenhum outro nome.
O painel, o site e o entregador usam a **mesma** regra, então o avatar nunca diverge.

---

## F) COMO O SITE IDENTIFICA O TENANT

`site.html?loja={ID}` → `loja-data.js` → `getTenant(id)`:

1. Lê o catálogo (tenants demo + `dp_sa_tenants` criados no fluxo/Super Admin).
2. Aplica os overrides salvos em `dp_tenant_{id}` (o que o usuário editou em Minha Loja).
3. Normaliza: infere `businessType` pela categoria quando falta, preenche `categoria`,
   calcula `logo` pelas iniciais, trata `whats`, `banners`, `statusLoja`.

**Fallback neutro (mudança de comportamento pedida):** se o id não existe e não há nada
salvo, `getTenant()` devolve `TENANT_NEUTRO` com `naoEncontrado:true` — nome e logo
**vazios**. O sistema **nunca mais carrega a loja de outra pessoa por engano**. Nesse caso
`site.html` esconde a página inteira e mostra **"Estabelecimento não encontrado"**,
informando o link recebido (`?loja=…`). O mesmo vale para acesso sem `?loja=`.

O site ainda lê o catálogo com `lerProdutos(id)` (leitura pura, **nunca** semeia) e os
banners com `TEN.banners` — só os da própria loja. Sem banners, o carrossel é **removido**
do DOM e o hero usa o fundo do tema (não sobra arte de outra loja).

---

## G) COMO O BOTÃO "VER MINHA LOJA" MONTA A URL

```js
function linkDaLoja(ten){
  const base = location.href.replace(/[^/]*$/,'');   // pasta do projeto
  return base + 'site.html?loja=' + encodeURIComponent(ten.id || CURRENT.tenantId);
}
```

O id vem **sempre** do tenant atual da sessão. Está usado nos três pontos: topo de
**Minha Loja**, **Configurações** e no fim do **assistente de 1ª configuração**
(🏪 VER MINHA LOJA). **Não existe nenhuma URL fixa** `site.html?loja=adega1998` ou
`?loja=adega-central` em nenhum arquivo.

No sentido inverso, o site ganhou um botão "Painel da loja" que aponta para
`plataforma.html?loja={ID}`, e o painel usa esse `?loja=` para **pré-selecionar** o
estabelecimento no login. O entregador também aceita `?loja={ID}`.

---

## H) COMO A PLATAFORMA MOSTRA O NOME ATUAL

`atualizarTenantUI()` é o ponto único. Ele lê `getTenant(CURRENT.tenantId)` e escreve:

- `#sideBrand` → **nome do estabelecimento** + categoria (ou "Painel", se ainda não houver tipo)
- `#sideLogo` → logo enviada ou iniciais
- `#sidebarTenant` → avatar + nome + "categoria • plano"
- `#pageCrumb` → nome do estabelecimento (`showPage()` acrescenta " • perfil")
- `document.title` → **"{Nome} — Painel"**
- `#loginPlatformName`, `#loginSubtitle`, `#loginMark` → acompanham o seletor de estabelecimento no login

Sem nome cadastrado, mostra "Estabelecimento sem nome" e avatar `·` — nunca o nome de
outra loja. Minha Loja atualiza tudo na hora em que o usuário salva, e o site reflete
(o site relê o tenant a cada carregamento).

---

## I) COMO O ENTREGADOR MOSTRA A IDENTIDADE DA LOJA

O entregador é vinculado a um tenant na tela de login (`#lgTenant`). A partir daí:

- cabeçalho: `#hdrLogo` com a logo do estabelecimento e `#hdrTenant` com o nome ao lado do status
- perfil: `drv.veiculo + " • " + nome do estabelecimento`
- `document.title` → **"{Nome} — Entregador"**
- login: `#lgLogo`, `#lgTitle` e `#lgSub` acompanham o estabelecimento selecionado

A lista de estabelecimentos agora é a mesma do resto do sistema (demo +
`dp_sa_tenants` + overrides de `dp_tenant_{id}`), então um estabelecimento criado no
painel aparece no app do entregador com o nome e a logo certos. **Removido** o fallback
`getTenantCatalog()[0]` — se o id não existir, o app devolve um tenant vazio em vez da
marca de outra loja. **Removida** a entrada `Adega 1998 / A98`.

---

## J) REFERÊNCIAS A "ADEGA" QUE AINDA EXISTEM (e por quê)

Busca final por `Adega`, `Adega 1998`, `Adega Central`, `A98`, `adega1998`:

| Local | Ocorrência | Aceitável? |
|---|---|---|
| `admin.html` | 20 (título, login `A98`, `dona@adega1998.com.br`, chaves `adega_caixa`, `adega_funcionarios`) | **Sim — legado.** Fora do fluxo (não é linkado por ninguém), preservado como histórico |
| `docs/` (relatórios, roadmap) | menções descritivas ao painel legado | **Sim — documentação** |
| `loja-data.js` linha 427 | `c.includes('adega')` dentro de `inferType()` | **Sim — palavra-chave**, não identidade: serve para reconhecer a categoria "Adega / Depósito de Bebidas" de dados antigos e mapear para o segmento bebidas |
| `loja-data.js` linha ~382 e `plataforma.html` linha ~1950 | comentários explicativos | **Sim — comentário** |
| Arquivos `.bak*` | cópias de backup | **Sim — backup** |

**Nenhuma ocorrência na interface principal.** Confirmei que `site.html`, `entregador.html`
e `plataforma.html` não têm `Adega 1998`, `Adega Central` nem `A98` como nome, logo, texto,
branding, título ou placeholder.

Também foram removidos dos dados demonstrativos: `adega1998` e `adega-central` **não são
mais tenants demo**. No lugar entraram `mercado-central` (Mercado Central) e
`imperial-bebidas` (Distribuidora Imperial), que cobrem os cenários pedidos. Os tenants
demo hoje são: **Burger do Zé**, **Pizza Prime**, **Mercado Central**, **Distribuidora
Imperial**.

> Observação: o segmento **bebidas continua inteiro** — template, categorias,
> 20 produtos-modelo, imagens. Nada do catálogo foi apagado. O que saiu foi apenas a
> identidade fixa "Adega". O rótulo do segmento mudou de "Adega / Bebidas" para
> "Loja de Bebidas".

---

## K) TESTES REALIZADOS

Validação **estática** (leitura de código + busca global). Sem `node --check`: o shell do
ambiente travou nesta sessão e não voltou (ver "Limitações" abaixo).

| # | Cenário | Resultado |
|---|---|---|
| 1 | `site.html?loja=burger-ze` | Nome **Burger do Zé**, iniciais **BZ**, headline "Burger do Zé, seu **lanche** favorito agora online", categorias de hamburgueria, seções de promoção/combos/avaliações ocultas se vazias. Nenhuma referência a Adega. ✅ |
| 2 | `site.html?loja=pizza-prime` | Nome **Pizza Prime**, iniciais **PP**, headline "Pizza Prime, sua **pizza** favorita agora online", produtos e categorias de pizzaria. ✅ |
| 3 | `site.html?loja=mercado-central` | Nome **Mercado Central**, iniciais **MC**, headline "Mercado Central, tudo o que você **precisa** agora online", categorias de mercado (Hortifruti, Mercearia, Açougue, Padaria). ✅ |
| 4 | `site.html?loja=imperial-bebidas` | Nome **Distribuidora Imperial**, iniciais **DI**, produtos de bebidas (cervejas, destilados, gelo, combos). Sem "Adega 1998" e sem "Adega Central". ✅ |
| 5 | `site.html?loja=nao-existe` | Tela **"Estabelecimento não encontrado"**, resto da página oculto, sem carregar loja alheia. ✅ |
| 6 | `site.html` sem `?loja=` | Mesma tela neutra. ✅ |
| 7 | Loja nova no painel | Nome vazio, sem tipo escolhido, avatar `·`, nada de "Adega 1998" pré-preenchido; o assistente exige a escolha do tipo. ✅ |
| 8 | `linkDaLoja()` | URLs geradas por `encodeURIComponent(ten.id)` — sem id fixo. ✅ |
| 9 | `document.title` | Site "{Nome} — Delivery" · Painel "{Nome} — Painel" · Entregador "{Nome} — Entregador". ✅ |
| 10 | Identidade entre apps | `iniciaisNome` idêntica em `loja-data.js` e `entregador.html`; mesmo tenant no painel e no site mostra o mesmo avatar. ✅ |
| 11 | Contrato do entregador | `o.driver === nome completo` e formato do pedido preservados; o app continua lendo `dp_{id}_orders` / `dp_{id}_drivers`. ✅ |
| 12 | Catálogo de bebidas | Template, categorias e 20 produtos intactos. ✅ |
| 13 | Fluxo de tenant | `saveTenant()` continua publicando em `dp_sa_tenants` (via `ensureTenantInSaCatalog`), então loja criada no painel aparece no site e no entregador. ✅ |

---

## L) O QUE AINDA FALTA

1. **Validação em navegador.** Rodei tudo por leitura de código. Falta abrir os 4 links
   num navegador de verdade e conferir visualmente hero, grade, carrinho e checkout.
2. **`admin.html` (legado).** Continua com a identidade Adega. Ele está fora do fluxo e
   serve de histórico — se a decisão for aposentá-lo, é só remover o arquivo (e os `.bak`).
   Não mexi porque a instrução era não apagar nada sem necessidade.
3. **`super-admin.html` não grava `businessType`.** Ele grava só `categoria`; o
   `getTenant()` infere o segmento. Funciona, mas o ideal é o Super Admin passar a gravar
   o tipo explicitamente (já estava pendente antes desta rodada).
4. **Favicon com a logo enviada.** Hoje o favicon usa a logo enviada ou um emoji do
   segmento. Sem logo, o emoji é o mesmo para todas as lojas do segmento — se quiser um
   favicon de iniciais, é uma linha a mais.
5. **Publicação.** Nada foi enviado ao GitHub/Vercel, conforme a instrução. O `git status`
   e o commit ficam com você.

---

## LIMITAÇÕES DESTA SESSÃO

O terminal do ambiente **travou** (erro de montagem `Plan9 share "c"` / usuário do sandbox)
e não voltou depois de 10 tentativas. Consequências:

- **não rodei `node --check`** em nenhum arquivo — a validação de sintaxe foi por leitura;
- **não usei `cp`/`cmp`** — os backups foram feitos por leitura + escrita, conferindo
  início e fim de cada arquivo contra o original;
- a conferência dos 4 cenários foi **estática** (busca + leitura), não executada.

Por isso o item L.1 é o mais importante: abra os links no navegador antes de publicar.
