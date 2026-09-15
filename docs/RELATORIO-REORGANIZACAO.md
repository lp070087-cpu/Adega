# Reorganização da plataforma — relatório final

**Data:** 2026-09-11
**Escopo:** reorganizar o projeto em 3 áreas (site público, plataforma, entregador),
tornar o `site.html` um template de loja multi-segmento e dar ao estabelecimento
controle total de marca e catálogo.

> **Nada foi publicado.** Sem deploy, sem alteração de configuração na Vercel, sem
> `git push`. A atualização do GitHub/Vercel fica por sua conta, como combinado.

---

## 1. Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `loja-data.js` | Fonte única de verdade: 10 templates de segmento, 4 tenants demo, `iniciaisNome()`, `lerProdutos()`, `getAvaliacoes()`, campo `banners` no tenant, correção do tipo de negócio de lojas criadas no Super Admin, iniciais centralizadas |
| `site.html` | Deixou de ser o site fixo da Adega 1998 e passou a ser o **template de loja multi-segmento**: branding, hero, categorias, produtos, promoções, combos, avaliações, rodapé, carrinho e checkout passaram a ser dirigidos por dados |
| `plataforma.html` | Passou a ser o **painel único e completo**: assistente de primeira configuração corrigido, catálogo sem semeadura indevida, upload de banners, pedidos-demo derivados do catálogo real, correções de estoque na cópia de produtos |
| `index.html` | Intocado — continua sendo o redirecionamento para `plataforma.html` (publicação Vercel) |
| `entregador.html` | Intocado — contrato de dados preservado |
| `super-admin.html` | Intocado — mantido apenas como referência |
| `admin.html` | Intocado — painel legado, preservado como histórico |

## 2. Arquivos criados

| Arquivo | Papel |
|---|---|
| `docs/RELATORIO-REORGANIZACAO.md` | Este relatório |
| `loja-data.js.bak-reorg-20260911` | Backup do estado anterior da camada de dados |
| `site.html.bak-reorg-20260911` | Backup do estado anterior do site |
| `plataforma.html.bak-reorg-20260911` | Backup do estado anterior do painel |

Os backups são cópias integrais, com contagem de linhas conferida arquivo por arquivo
(457 / 1770 / 2722). Os backups antigos (`admin.html.bak*`,
`Apresentação do site.html.bak*`, `*.bak-reorg-20260904-*`) continuam no lugar.

## 3. Funções migradas do `admin.html` para a plataforma

O painel legado tinha 40 funções. Todas as que ainda fazem sentido existem agora em
`plataforma.html`, com o mesmo comportamento e nomes alinhados ao novo padrão:

| `admin.html` (legado) | `plataforma.html` (atual) |
|---|---|
| `doLogin` / `doLogout` | `initLogin` / `doLogin` / `logout` / `doLogout` |
| `storeGet` / `storeSet` / `storeRemove` | movidas para `loja-data.js` (usadas pelos 3 apps) |
| `openProductModal` / `closeProductModal` / `saveProduct` | `abrirNovoProduto` / `abrirEditarProduto` / `salvarProduto` / `fecharModal` |
| `openOrderDetail` / `closeOrderDetail` | `abrirDrawer` / `fecharDrawer` |
| `setPeriod` / `parseDateBR` / `applyPeriodFilter` | `setVendasPeriod` / `setRelPeriod` / `pedidosPeriodo` / `ehHoje` |
| `selectDeliverer` / `marcarSaiuEntrega` | `atribuirEntregador` / `moverStatus` |
| `loadCaixa` / `updateCaixaUI` / `setPagamento` / `registrarMovimento` | mesmos nomes |
| `abrirCaixa` / `trocarTurno` / `renderTurnos` / `fecharCaixa` | mesmos nomes |
| `registrarSangria` / `registrarSuprimento` / `saveCaixa` | mesmos nomes |
| `loadFuncionarios` / `renderFuncionarios` / `updateTurnoSelect` | `getFuncionarios` / `renderEquipe` (turno agora é campo do caixa) |
| `addFuncionario` / `editarFuncionario` / `removerFuncionario` | `abrirNovoFuncionario` / `abrirEditarFuncionario` / `salvarFuncionario` / `removerFuncionario` |
| `renderFreteRows` / `addFreteRow` / `removeFreteRow` | mesmos nomes |
| `salvarConfiguracoesLoja` / `salvarConfiguracoes` | `salvarMinhaLoja` / `salvarConfigGeral` / `salvarConfigEntrega` |
| `extrairCoordenadasDoLink` / `distanciaEntreCoordenadas` / `calcularFreteParaDistancia` / `testarCalculoFrete` | mesmos nomes |
| `animateChart` | gráfico nativo do dashboard em SVG (sem dependência externa) |

Ganhos que **não** existiam no `admin.html`: Central de Pedidos em kanban com 8 status,
filtro por origem, drawer com linha do tempo, mapa/expedição, relatórios por período e
origem, integrações honestas, multi-tenant com troca de empresa, assistente de primeira
configuração e o botão **VER MINHA LOJA**.

## 4. Templates de segmentos criados

Dez segmentos em `loja-data.js` → `BUSINESS_TEMPLATES`, com **139 produtos-modelo** no
total. As listas de categoria seguem exatamente o que você definiu:

| Segmento | Categorias | Produtos |
|---|---|---|
| Adega / Bebidas | Cervejas, Whisky, Vodka, Gin, Vinhos, Refrigerantes, Energéticos, Água, Gelo, Combos | 20 |
| Hamburgueria | Hambúrgueres, Combos, Hot Dog, Porções, Batata, Bebidas, Sobremesas, Adicionais | 20 |
| Pizzaria | Pizzas Tradicionais, Pizzas Especiais, Pizzas Doces, Bebidas, Combos | 13 |
| Açaí | Açaí, Combos, Adicionais, Bebidas | 13 |
| Lanchonete | Lanches, Salgados, Acompanhamentos, Bebidas, Sobremesas | 13 |
| Restaurante | Pratos Executivos, Marmitas, Bebidas, Sobremesas | 10 |
| Conveniência | Bebidas, Snacks, Mercearia, Gelo, Outros | 11 |
| Padaria | Pães, Salgados, Doces & Bolos, Bebidas | 13 |
| Mercado | Hortifruti, Mercearia, Açougue, Bebidas, Padaria, Higiene | 15 |
| Dark Kitchen | Lanches, Massas, Pratos, Sobremesas, Bebidas | 11 |

Os produtos do modelo são **copiados** (nunca vinculados) para o catálogo do
estabelecimento no momento em que ele marca o que vende. Depois disso o cliente edita
nome, foto, descrição, preço, preço promocional, categoria, estoque, variações,
adicionais, disponibilidade, duplica ou exclui — sem nenhum efeito no modelo.

## 5. Funcionamento do branding

Tudo vem de `getTenant(id)`, que lê o catálogo de tenants e aplica os ajustes salvos em
`dp_tenant_{id}`. O painel grava; o site lê. Campos usados: **Logo** (upload em base64
ou avatar de iniciais), **Nome**, **Descrição**, **Telefone**, **WhatsApp**, **Endereço**,
**Horários**, **Tipo de negócio**, **Pedido mínimo**, **Raio de entrega**, **Taxa base**,
**Taxa por km**, **Tempo médio**, **Status**, **Cor da marca** e **Banners**.

Logo: se houver imagem enviada, o site mostra a imagem (com `object-fit: contain`, para
não cortar a marca). Se não houver, gera o avatar de iniciais pela função
`iniciaisNome()`, que ignora preposições — *Burger do Zé → BZ*, *Adega Central → AC*,
*Adega 1998 → A9*. A mesma regra vale no painel, no assistente e no site, então o avatar
nunca diverge entre telas.

Cor da marca: o laranja do tema é o padrão, mas ao escolher outra cor o site deriva
automaticamente os 4 tons do design system (`--orange`, `--orange-dark`, `--orange-glow`,
`--orange-light`), de modo que nenhuma loja fica com cor quebrada.

Status: `aberta` mantém o site normal; `fechada` ou `pausada` faz aparecer a faixa de
aviso no topo, bloqueia o "Adicionar" e o checkout, e troca a mensagem do CTA.

Banners: cada loja tem a própria lista. A Adega 1998 mantém as 4 artes atuais como
**dado demonstrativo**; qualquer outra loja nasce **sem carrossel** (o hero vira um fundo
degradê, sem slide vazio) e passa a exibi-lo quando enviar banners em Minha Loja.

## 6. Funcionamento do catálogo

Fluxo pensado na ordem que você pediu — **escolher o que vende → definir preços → ajustar
o resto se quiser**:

1. **Assistente de primeira configuração** (5 etapas): tipo de negócio → nome e identidade
   → produtos que trabalha (com "Marcar todos"/"Desmarcar" e busca) → preços → pronto.
   Na primeira configuração o catálogo **nasce exatamente da seleção**: nada é semeado
   antes, para que a escolha do cliente seja respeitada de verdade.
2. **Ajuste de preços** na própria etapa 3 do assistente, com edição rápida em lote.
3. **Catálogo do dia a dia**: busca por nome/categoria/SKU, filtro por categoria e por
   situação (ativos, inativos, estoque baixo), edição de preço e promoção inline,
   ATIVO/INATIVO com um clique, editar, duplicar, ajustar estoque, excluir e adicionar
   produto. Resumo no topo com totais. Exportação em CSV.
4. **Escolher do modelo do segmento** a qualquer momento (fora do assistente), para
   acrescentar itens do template sem mexer no que já existe.
5. **Troca de segmento** em Minha Loja: o painel pergunta se você quer carregar o modelo
   do novo segmento e **preserva os produtos atuais**.

Dois detalhes técnicos que garantem que o catálogo não se perde nem se corrompe:
`getProducts()` semeia (grava) e só roda no boot de loja já configurada;
`lerProdutos()` é leitura pura e nunca grava — é o que o site e as telas do painel usam.
Assim, abrir o site não cria catálogo nem sobrescreve escolha do cliente.

## 7. Funcionamento do `site.html`

O site **não foi reconstruído** — o desenho premium atual foi mantido. O que mudou é que
ele deixou de ter "Adega 1998" embutido no HTML e passou a se montar a partir do
estabelecimento da URL (`site.html?loja=ID`).

Dinamicamente, o site passa a controlar: título e metadados (incluindo Open Graph),
logo e nome no cabeçalho e no rodapé, cor da marca, texto e descrição do hero, estatísticas
do hero, cartões flutuantes de produto, pílulas de categoria, grade de produtos, vitrine de
promoções, combos, textos de entrega, bloco "Sobre", avaliações, CTA, contato e horários do
rodapé, links de WhatsApp, faixa de status da loja, banners e todo o carrinho/checkout.

Regras por segmento, sem nada de adega aparecendo em hamburgueria: as categorias saem dos
produtos reais na ordem do template; a palavra do hero muda conforme o segmento (adega,
hamburgueria, pizzaria, açaiteria, mercado, padaria, lanchonete, conveniência,
restaurante); a seção de promoções e o item de menu somem quando não há promoção; a seção
de combos e o item de menu somem quando não há combo; o carrossel de banners da Adega 1998
é removido nas outras lojas; e a foto demonstrativa do bloco "Sobre" não é reaproveitada —
se a loja não tem produto com foto, a coluna é removida em vez de mostrar foto alheia.

O carrinho e o checkout continuam funcionando: gravam o pedido em `dp_{tenantId}_orders`
com `source:'site'` e status `new`, respeitam o pedido mínimo, calculam o frete pela
configuração da loja e abrem o WhatsApp do estabelecimento com o resumo. A escrita usa
exatamente o mesmo formato que o painel e o entregador já leem.

Avaliações: a seção agora é dirigida por dados (`getAvaliacoes()`). **Sem avaliações
cadastradas, a seção e os números de nota ficam ocultos** — nada de nota ou depoimento
inventado. O bloco antigo de avaliações fixas foi removido.

## 8. Funcionamento da plataforma

`plataforma.html` é o **único** painel operacional. O menu final tem os 14 itens que você
definiu: Visão Geral, Central de Pedidos, Minha Loja, Catálogo, Clientes, Entregadores,
Mapa / Expedição, Caixa, Estoque, Vendas, Relatórios, Integrações, Equipe / Funcionários e
Configurações.

Minha Loja concentra identidade, marca (logo + banners) e regras de entrega, com
pré-visualização do avatar. Dois botões abrem o site: **👁️ Pré-visualizar site** e
**🏪 VER MINHA LOJA** (o mesmo botão aparece no fim do assistente e em Configurações). O
link público também aparece como texto para copiar, no formato
`.../site.html?loja={id}`.

Dentro do painel, o catálogo, os pedidos, os entregadores, o caixa e o estoque passaram a
ler o mesmo catálogo real do segmento — inclusive os pedidos de demonstração, que agora
usam produtos do segmento certo em vez de cerveja em toda loja.

## 9. Funcionamento do entregador

`entregador.html` **não foi alterado**. Continua lendo `dp_{tenantId}_orders` e
`dp_{tenantId}_drivers`, casando o pedido com o entregador pelo **nome completo**
(`o.driver === driver.nome`), e o contrato do pedido foi mantido idêntico:
`{id, seq, source, customer, phone, address, items:[{nome,qtd,preco,opts}], subtotal,
frete, total, pag, payOk, status, driver, obs, createdAt, timestamps}`. Por isso o pedido
que nasce no site ou na plataforma aparece corretamente no app do entregador, e o fluxo
iniciar rota → cheguei → prova de entrega continua igual.

## 10. Testes realizados

**Ambiente:** o shell do sandbox ficou inoperante nesta sessão (falha de montagem do
volume, 6 tentativas). Isso impediu `node --check` e a criação de backups por linha de
comando. **Contornei com validação estática assistida e os backups foram criados por outra
via**, com conferência de conteúdo linha a linha. O que foi verificado:

- **Sintaxe:** os três arquivos foram lidos por inteiro, bloco de script por bloco de
  script. Chaves, parênteses e colchetes balanceados; nenhuma string aberta; nenhum
  apóstrofo sem escape (`Jack Daniel\'s` está correto nos dois lugares onde aparece).
- **Globais:** todas as funções e constantes que o `site.html` chama existem — em
  `loja-data.js` (`getTenant`, `templateByType`, `lerProdutos`, `getProducts`, `storeGet`,
  `fmtBRL`, `categoriaComEmoji`, `iniciaisNome`, `getAvaliacoes`, …) ou no próprio arquivo.
- **Duplicidade:** 157 funções em `plataforma.html` e 33 em `site.html`, todas com nome
  único; nenhuma declaração `const`/`let` repetida.
- **IDs:** cada `$('id')` do script do site tem o `id="..."` correspondente no HTML (60
  IDs distintos, todos resolvidos). Nenhum `id` duplicado no arquivo.
- **Handlers:** cada `onclick`/`onchange`/`oninput` do painel aponta para uma função
  existente (73 ocorrências, todas resolvidas).
- **Compatibilidade do entregador:** contrato de pedido e chaves de storage conferidos.

**TESTE 1 — Burger do Zé / Hamburgueria** (`site.html?loja=burger-ze`)

Confirmado por inspeção do código e dos dados:
- Nome "Burger do Zé" no título, no cabeçalho e no rodapé; avatar **BZ** (não "BD").
- Cor da marca `#E11D48` aplicada nos 4 tons do tema.
- Categorias vindas do template de hamburgueria: Hambúrgueres, Hot Dog, Porções, Batata,
  Bebidas, Sobremesas, Adicionais, Combos.
- Produtos de lanchonete (X-Burger, X-Bacon, Hot Dog, batatas, milk-shake), com os preços
  do catálogo — não há nenhum item de bebida alcoólica do template de adega.
- Carrossel de banners **removido** (o Burger do Zé não tem banners próprios) e hero
  ajustado para o fundo degradê.
- Foto demonstrativa do "Sobre" não é reaproveitada se não houver produto com foto.
- Seção de avaliações oculta, porque a loja não tem avaliações cadastradas.

**TESTE 2 — Adega Central / Bebidas** (`site.html?loja=adega-central`)

No **mesmo** `site.html`, trocando apenas o parâmetro:
- Nome "Adega Central" no título, cabeçalho e rodapé; avatar **AC**; cor `#0E7490`.
- Categorias de bebidas: Cervejas, Whisky, Vodka, Gin, Vinhos, Refrigerantes,
  Energéticos, Água, Gelo, Combos.
- Produtos de bebida com os preços do catálogo, e nenhum item de hamburgueria.
- Faixa de status, rodapé de contato (endereço, telefone, WhatsApp, horário) e regras de
  entrega (raio 15 km, mínimo R$ 35, tempo 30 min) vindos dos dados da loja.
- Botão VER MINHA LOJA/Painel apontando para a mesma loja.

Os quatro tenants demo disponíveis são `adega1998`, `burger-ze`, `pizza-prime` e
`adega-central`. Qualquer loja nova criada pelo Super Admin entra na mesma lista e ganha
site automaticamente.

## 11. Problemas encontrados (e o que foi feito)

Estes foram encontrados durante a implementação e corrigidos:

1. **Categoria corrompida ao copiar produtos.** A cópia gravava o emoji dentro do campo
   `cat`, o que quebraria os filtros, as pílulas do site e a detecção de Combos. Corrigido
   para gravar a categoria limpa e o emoji no campo próprio.
2. **Catálogo semeado antes da escolha do cliente.** O modelo ia para o catálogo antes de o
   cliente marcar o que vende, contrariando o requisito. Corrigido em três pontos, com a
   separação `getProducts()` (grava) × `lerProdutos()` (só lê).
3. **Pedidos-demo com produtos de adega em toda loja.** Havia nomes de cerveja fixos e
   exceções só para dois tenants, então uma pizzaria mostrava cerveja nos pedidos. Agora
   todos os pedidos-demo derivam do catálogo real do segmento.
4. **Super Admin transformava toda loja nova em adega.** A loja criada lá guardava só a
   categoria, e o código forçava `businessType:'bebidas'`. Corrigido para inferir o tipo
   pela categoria cadastrada.
5. **IDs ausentes na faixa de entrega do site.** O script escrevia em elementos que não
   existiam no HTML. Os IDs foram criados.
6. **Empresa criada no Super Admin saía com laranja padrão fixo.** Passou a não forçar cor,
   caindo no padrão do tema quando não há cor definida.
7. **Iniciais erradas para "Adega 1998" (virava "A1").** Centralizado em `iniciaisNome()`,
   respeitando o logo já definido quando existe.
8. **Produto copiado nascia com estoque 0** e aparecia como "Esgotado" no site. A cópia
   agora usa os mesmos padrões do template (estoque 100 quando não informado).
9. **Etapa de preços do assistente não salvava nada.** O container com os campos não tinha
   o `id` que a função de avançar procurava. Corrigido.
10. **Produto sem campo `estoque` era tratado como esgotado**, porque `Number(undefined)`
    não é maior que zero. Agora só o `0` explícito bloqueia a venda.
11. **Carrinho quebrava com itens antigos sem lista de opções.** Normalização aplicada.
12. **Vazamento de `IntersectionObserver`** a cada nova renderização de produtos, com o
    observer recriado e nunca desconectado. Agora é único e reconectado.
13. **Timer do slideshow continuava rodando** depois de o bloco ser removido do DOM nas
    lojas sem banners. O slideshow passou a consultar o DOM e a se limpar.
14. **Duas faixas de "nota" com número inventado** (98% de satisfação e 98% de entregas no
    prazo). Substituídas por avaliação real ou ocultadas.
15. **Foto demonstrativa da Adega 1998 aparecia no "Sobre" de outras lojas.** Agora a
    coluna é removida quando a loja não tem produto com foto.
16. **Rodapé mostrava contato vazio** ("Telefone:", "Endereço:") em lojas sem esses dados.
    Os itens passaram a aparecer só quando há informação.
17. **Caracteres corrompidos** em um comentário do painel ("Expedi??o"). Corrigido.
18. **Menu de categorias do site ficava preso** a elementos que eram recriados pelo script.
    Passou a usar delegação de evento.

**Limitação honesta:** não foi possível executar o site num navegador nem rodar um
verificador de sintaxe por linha de comando nesta sessão, porque o shell do ambiente está
inoperante. Toda a validação foi estática (leitura integral dos arquivos + conferência
cruzada de identificadores). A validação visual final precisa ser feita por você, abrindo
os arquivos no navegador.

## 12. O que ainda falta

**Validação e publicação (por sua conta, como combinado):**
- Abrir `plataforma.html`, entrar com uma loja demo, percorrer o assistente e conferir
  Minha Loja, Catálogo e Central.
- Abrir `site.html?loja=burger-ze` e `site.html?loja=adega-central` e conferir os dois
  cenários na tela.
- Fazer o commit e o push para o GitHub e deixar a Vercel republicar. **Não fiz nada disso.**

**Pendências funcionais conhecidas:**
- **Avaliações não têm tela de cadastro.** A estrutura de leitura existe
  (`dp_{tenantId}_avaliacoes`) e a seção aparece sozinha quando houver dados, mas ainda não
  há como o estabelecimento cadastrar uma avaliação pelo painel. Hoje, sem dados, a seção
  fica oculta — o que é o comportamento correto, mas falta a tela.
- **Cálculo de frete por distância é simplificado no site.** Usa a primeira faixa
  configurada em vez de geocodificar o endereço. O painel mantém o cálculo completo por
  coordenadas. Melhorar isso exige serviço de geocodificação.
- **Integrações iFood / 99Food / Zé Delivery seguem em MODO DEMONSTRAÇÃO.** Nenhuma
  chamada real, e o botão "Testar conexão" não simula sucesso — depende de credenciais e
  homologação.
- **Super Admin fora do fluxo atual.** Ficou só como referência. Se quiser usá-lo de
  verdade, ele precisa ser revisto para gravar também o tipo de negócio da loja.
- **`admin.html` legado.** Continua no projeto apenas como histórico; a operação toda já
  vive em `plataforma.html`.
- **Persistência é local (localStorage).** Cada navegador tem seus dados. A migração para
  Next.js + PostgreSQL + Prisma segue como próxima fase (ver `docs/SCHEMA-PRISMA.md`), e é
  o que transforma isso em produto real multi-dispositivo.
