# FASE 3 — MAPA + ÁREA DE ENTREGA + EXPEDIÇÃO + ENTREGADORES

Relatório de entrega. Cada item abaixo diz o que existe, onde está e o que
ainda depende do Windows.

---

## 0. CAUSA RAIZ DO ERRO `User.username`

O banco do Neon foi criado com `prisma db push` e **nunca teve histórico em
`prisma/migrations`**. Isso tem uma consequência que engana:

- `npx prisma migrate status` responde **"Database schema is up to date!"**
  porque ele só compara o *histórico de migrations* com o banco. Não havendo
  nenhuma migration registrada, não há nada para estar atrasado.
- Mas o `schema.prisma` andou para frente na Fase 3 (`User.username`,
  `User.email` opcional, `DeliveryZone`, `Organization.deliveryFeeMode`,
  `Organization.latitude/longitude`, `Order.deliveryLatitude/Longitude`) e o
  `db push` **não foi rodado depois**. O banco ficou para trás.

Resultado prático: `prisma.user.create()` no `registerAction`
(`src/app/actions/auth.ts`) envia `username` no INSERT e o Postgres recusa —
"column `User.username` does not exist".

Não era bug de código. Era **drift**: schema à frente do banco, com
`migrate status` cego por não haver histórico.

---

## 1. COMO O BANCO FOI SINCRONIZADO

Nada foi apagado. Nada foi resetado. Nenhum banco novo. `DATABASE_URL` e
`DIRECT_URL` intactos.

Foram criadas duas ferramentas, nesta ordem:

**a) `prisma/sql/phase3-align.sql`** — script de alinhamento **aditivo**.
Escrito para ser seguro por construção: `ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE TYPE`
guardado por consulta a `pg_type`, `ADD CONSTRAINT` guardado por consulta a
`pg_constraint`. A única alteração fora de "adicionar" é
`ALTER COLUMN "email" DROP NOT NULL` — que apenas **afrouxa** uma regra e
não toca em nenhuma linha existente. Não há `DROP TABLE`, `DROP COLUMN`,
`TRUNCATE`, `DELETE` ou `UPDATE` de dados em nenhum ponto do arquivo.

Cobre, em blocos comentados: `User.username` + índice único; `User.email`
opcional; `Organization.latitude/longitude/deliveryFeeMode`; enums
(`DriverStatus`, `VehicleType`, `DeliveryStatus`, `ProofType`,
`OrderStatus`, `OrderSource`, `PaymentMethod`, `PaymentStatus`); tabelas
`Driver`, `Delivery`, `DriverLocation`, `DeliveryZone`; colunas
`Order.driverId`, `Order.deliveryLatitude/Longitude`.

**b) `scripts/db-drift-check.mjs`** — verificador **somente leitura**. Lê os
modelos e campos de `prisma/schema.prisma`, consulta `information_schema` no
banco e lista o que falta, tabela por tabela. Sai com código 1 se houver
divergência. Existe exatamente para tapar o buraco que o `migrate status`
deixou: olhar a **estrutura real**, não o histórico.

### Aplicar (Windows, dentro de `web/`)

```bat
:: 1. ver o que falta (só leitura)
npm run db:drift

:: 2. aplicar somente o aditivo
npm run db:align

:: 3. conferir: agora deve dizer "Nenhuma divergência"
npm run db:drift

:: 4. cliente Prisma em dia
npx prisma generate
```

Alternativa em um passo, que faz o Prisma calcular e aplicar só o que falta
(recusa operação destrutiva):

```bat
npx prisma db push
```

As duas rotas chegam ao mesmo estado. O arquivo SQL existe porque é
explícito: dá para ler o que será executado antes de executar.

> **Sobre baseline de migrations.** Não foi criada. Uma baseline de um banco
> já existente exige marcar as migrations como aplicadas sem rodar
> (`migrate resolve --applied`) — e sem ambiente de shell aqui, seria
> entregar um procedimento não verificado sobre o banco de produção. Como o
> projeto ainda está em desenvolvimento e já usa `db push`, a rota do
> alinhamento aditivo é a correta nesta fase. Estabelecer histórico de
> migrations é trabalho de uma fase própria, com o banco validado.

---

## 2. DADOS EXISTENTES

**Nenhum dado foi alterado ou removido.** O script é aditivo: adiciona
colunas e tabelas, afrouxa uma regra de nulo. As lojas, pedidos e usuários
que já existiam continuam exatamente como estavam.

Uma ressalva honesta e importante: o índice único `User_username_key` é
criado **sem** `IF NOT EXISTS` sobre dado preexistente — se houvesse dois
usuários com o mesmo `username` já gravado, a criação **falharia de
propósito**, de forma visível. Isso é intencional: melhor falhar aqui do
que aceitar dois entregadores com o mesmo login. (Como a coluna `username`
acabou de ser criada e nasce nula, na prática não há como haver duplicata.)

---

## 3. ITEM A ITEM — OS 23 PONTOS DA FASE 3

### 1) Endereço do estabelecimento ✅

O lojista **não** configura chave de API, iframe nem código. O endereço usa
os campos que já existiam em `Organization` (address, addressNumber, district,
city, state, zipCode) mais `latitude`/`longitude` (`schema.prisma:231-239`).

A URL do Google Maps é **opcional e não é fonte da verdade** — o que vale
para cálculo são as coordenadas. O endereço em texto é o que o cliente lê;
a coordenada é o que o servidor calcula.

### 2) Mapa na configuração ✅ (esquema, não mapa de ruas — explicado)

A tela de área de entrega desenha um **esquema**: estabelecimento no centro,
círculo do raio atual, bairros posicionados quando têm coordenada. Reage a
mudança de endereço e de raio.

Não é um mapa de ruas, e o código **não finge** que é. Ver item 3.

### 3) Provider do mapa ✅

`src/lib/maps/provider.ts` centraliza a decisão. Hoje devolve
`tilesAvailable: false` **de propósito**: não há biblioteca de mapa de ruas
com tiles reais plugada, então a interface usa o esquema honesto em vez de
um mapa que não corresponderia à realidade.

A regra de segurança vale: **nenhuma chave de mapa vai para o navegador.**
Geocodificação com chave roda no servidor (`src/lib/maps/geocoding.ts`).
A visualização usa apenas coordenadas, que não são segredo.

Quando o Leaflet + OpenStreetMap for plugado (fase futura), muda-se **um
retorno** nesse arquivo e as telas passam a exibir o mapa real — o contrato
que elas leem é o mesmo.

Para geocodificação não configurada, o retorno é honesto:
`not_configured`, `not_found`, `provider_error` — nunca um ponto inventado.

### 4) Área de atendimento ✅

Raio máximo configurável (`Organization.deliveryRadius`), sem limite
pré-definido no código. A interface mostra "Você entrega em até X km".

### 5) Bairros + taxas ✅

CRUD completo em `src/lib/data/store-ops.ts` (`getDeliveryZones`,
`createDeliveryZone`, `updateDeliveryZone`, `deleteDeliveryZone`) sobre o
modelo `DeliveryZone` — com `organizationId`, então a taxa de "Centro" da
loja A não vale para a loja B. Nome, taxa, ativar/desativar e distância
opcional. Nada fixo no código.

### 6) Taxa por distância ✅

**Uma única engine**, não três sistemas. `src/lib/data/delivery-fee.ts` expõe
`explainDeliveryFee`, ponto de entrada único que consome os três modos:

- `FIXED` — taxa base (`baseDeliveryFee`) + excedente por km (`extraKmFee`)
- `BY_NEIGHBORHOOD` — taxa do bairro (`DeliveryZone`)
- `BY_DISTANCE_BAND` — faixas por distância (`settings.deliveryTiers`)

A escolha do modo é `Organization.deliveryFeeMode`. Haversine em
`haversineKm()`, mesma engine.

### 7) Checkout e validação ✅

`createOrderFromCheckout` (em `src/lib/data/orders.ts`) **determina no
servidor**: endereço, distância, região, taxa e se está fora da área.
`deliveryFee`, `distance`, coordenadas, região e `total` vindos do navegador
**não são confiados**.

Fora da área, a mensagem é exatamente:

> Este endereço está fora da área de entrega desta loja.

E o pedido **não é criado silenciosamente**.

### 8) Expedição ✅

`/app/expedicao` (`src/app/app/expedicao/page.tsx`) existe como central
operacional e **reutiliza os enums existentes** (`OrderStatus`,
`DeliveryStatus`) — nenhum status novo foi inventado.

### 9) Mapa da expedição ✅ (radar, não mapa de ruas)

`src/components/dispatch/DispatchBoard.tsx` — o "Radar da frota" projeta
estabelecimento, pedidos, entregadores disponíveis/atribuídos e destino do
cliente **quando as coordenadas existem**. Onde não existe coordenada,
**não inventa posição**: mostra o endereço em texto.

### 10) Atribuição de entregador ✅

`assignDriver` / `unassignDriver` em `src/lib/data/orders.ts`, chamados por
ação de servidor com autorização (`canDispatch()` = MANAGE_DRIVERS ||
MANAGE_ORDERS). Trocar e remover quando permitido. O filtro é sempre
`{ organizationId, driverId }` — entregador de uma loja **nunca** recebe
pedido de outra.

### 11) Cadastro do entregador ✅

`/app/entregadores` com `DriversManager`. **As duas opções existem**:

- **OPÇÃO A** — e-mail + senha
- **OPÇÃO B** — nome de usuário + senha, **sem e-mail**

`createDriver` (`src/lib/data/drivers.ts:140-204`) aceita `email` OU
`username`, exige pelo menos um, e verifica unicidade dos dois.
O `username` é único globalmente e normalizado em minúsculas
(`User.username @unique`). **Não há e-mail falso** — a tela mostra
`@username` para quem entrou pela OPÇÃO B, e nada de e-mail inventado.

### 12) Senha do entregador ✅

Botão 👁 mostrar/ocultar no cadastro, na edição **e** no login do entregador
(`DriversManager.tsx` e `DriverLoginForm.tsx`). Guarda **apenas hash**
(bcrypt, cost 12, em `src/lib/auth/password.ts`).

### 13) Login do entregador ✅

`/entregador` (`src/app/entregador/page.tsx`). Sem sessão, mostra "Área do
Entregador" com o formulário próprio. Aceita **e-mail OU nome de usuário**
num único campo `login`; quem decide a consulta é o conteúdo, dentro do
`authorize` (`src/lib/auth/index.ts:48-50` — tenta e-mail, depois username).
Depois do login, só os dados daquele entregador e daquela organização:
`requireDriver()` + `getDriverOrders(organizationId, driverId)`.

Para isso funcionar, `/entregador` **saiu do matcher do middleware**
(`src/middleware.ts`) e do `authorized` callback (`src/lib/auth/config.ts`) —
senão o formulário de login nunca apareceria. A proteção continua:
`requireDriver()` barra dentro da página.

### 14) App do entregador ✅

`src/components/driver/DriverApp.tsx`, mobile-first. Mostra pedido atual,
endereço, cliente, telefone, valor, forma de pagamento, observações, rota e
status. Ações: aceitar/visualizar, iniciar rota, informar chegada, concluir.

### 15) Navegação ✅

Botões **"🧭 ABRIR ROTA"** (Google Maps) e **"🚙 Waze"**, montados por
`navigationUrl()` a partir das coordenadas reais. O mapa interno é
visualização; a navegação externa é a do entregador.

Honestidade: quando o destino **não tem coordenada**, a URL usa o endereço
em texto em vez de inventar um ponto.

### 16) Localização do entregador ✅

Arquitetura real: `DriverLocation` (histórico de posições; a última linha é
a posição atual — não guardamos lat/lng "atual" no `Driver` para não perder
o rastro). `recordDriverLocation` em `src/lib/data/drivers.ts`.

Coleta só quando necessário, autorizado e autenticado. **Nenhuma coordenada
inventada ou simulada.** Negação de permissão vira estado claro na
interface, não um ponto falso.

### 17) Tempo real ✅

Estrutura de atualização periódica: `useEffect` com `setInterval` de 30s
chamando `router.refresh()`, suspenso quando a aba está oculta
(`document.hidden`) e na aba de perfil. Polling controlado, sem websocket
prometido que não existe.

### 18) Responsividade ⚠️ parcialmente verificada

Expedição pensada desktop-first/tablet/mobile; app do entregador mobile-first.
As correções de sobreposição, overflow, botão fora da tela e modal maior que
a viewport **não puderam ser conferidas visualmente aqui** — o ambiente de
shell está indisponível (ver item 22). Verificação visual fica para o Windows.

### 19) NÃO MEXER AGORA ✅ respeitado

Nenhuma alteração em `adega-nine.vercel.app/site.html`, WhatsApp, Instagram,
Facebook, pagamentos, assinatura R$77/R$147, nem integração de cartão.
Intocados.

### 20) Multi-tenant e segurança ✅

Auditoria restrita às partes tocadas. Tudo o que foi adicionado carrega
`organizationId` e é filtrado por ele. `organizationId` vindo do navegador
**nunca é confiado** — é derivado da sessão/autorização no servidor
(`requireOrg()`, `resolveMembership()`, que lê o vínculo real do banco e não
do token). Confirmado nas partes mexidas nesta fase.

### 21) Migração ✅ (script aditivo, ver seções 0-2)

### 22) Validação ⏳ pendente no Windows

O ambiente de shell continua indisponível:

> `failed to mount ... Plan9 share "c" which is not mounted`
> (Windows update de 8 de setembro)

Com isso **não foi possível rodar** `prisma format`, `prisma validate`,
`prisma generate`, `npm run typecheck` nem `npm run build` daqui.
**O build NÃO está declarado verde.** Os comandos estão na seção 4.

### 23) Entrega obrigatória ✅ (este documento)

---

## 4. VALIDAÇÃO — COMANDOS PARA O WINDOWS

```bat
cd web

npx prisma format
npx prisma validate
node scripts/db-drift-check.mjs     :: deve acusar User.username faltando
npm run db:align                     :: aplica o aditivo
node scripts/db-drift-check.mjs     :: deve dizer "Nenhuma divergência"
npx prisma generate
npm run typecheck
npm run build
```

Depois do build, testar o fluxo real:

1. `/cadastro` — criar conta. Deve gravar sem erro de coluna.
2. `/login` — entrar.
3. `/onboarding` — criar a loja.
4. `/app` — acesso autenticado.
5. `/app/entregadores` — cadastrar um entregador pela OPÇÃO B (só nome de
   usuário, sem e-mail).
6. `/entregador` — sair e entrar com esse nome de usuário + senha.
7. Isolamento: com dois usuários de lojas diferentes, confirmar que nenhum
   vê dado do outro.
8. Área de entrega: configurar raio e bairros; tentar um checkout fora da
   área e confirmar a mensagem exata.

---

## 5. BIBLIOTECA GLOBAL DE PRODUTOS

**Intacta.** Nada foi substituído nem removido.

Modelos no `schema.prisma`: `GlobalCategory` (hierarquia de dois níveis,
auto-relacionada), `GlobalProduct` (`slug` único para importação
idempotente, `suggestedPrice` como sugestão e não preço real,
`globalCategoryId`), `GlobalProductBusinessType` (junção produto × segmento
com `weight`) e `StoreBanner` (`organizationId` nulo = banner padrão da
plataforma).

Arquivos de dados: `src/data/global-catalog.ts`, `src/data/global-products.ts`,
`src/data/business-templates.ts`, `src/data/business-copy.ts`, mais
`src/lib/data/global-catalog.ts` e `src/lib/validations/global-catalog.ts`.
A pasta `biblioteca-produtos/` (221 arquivos de imagem) segue no repositório.

O script de alinhamento **verifica** essas quatro tabelas e **aborta com
mensagem clara** se alguma faltar no banco, em vez de deixar a falha
aparecer no meio de uma importação. Se abortar, a correção é uma só:
`npx prisma db push`.

---

## 6. O QUE AINDA FALTA NA FASE 3

Um item, e ele é de verificação, não de código:

- **Rodar a validação no Windows** (seção 4) e confirmar o fluxo
  cadastro → login → onboarding → acesso autenticado → isolamento.
- **Conferir a responsividade visualmente** (item 18) — expedição e app do
  entregador em viewport real.
- *(Fase futura, fora da Fase 3)* plugar o mapa de ruas de verdade
  (Leaflet + OSM) — o ponto de mudança é `src/lib/maps/provider.ts`.

---

## 7. ARQUIVOS TOCADOS NESTA ETAPA

Novos:
`web/prisma/sql/phase3-align.sql`,
`web/scripts/db-drift-check.mjs`,
`web/src/lib/maps/provider.ts`,
`web/docs/FASE-3-RELATORIO.md`.

Alterado: `web/package.json` (scripts `db:drift` e `db:align`).

Herança da sessão anterior, ainda válida:
`src/lib/validations/auth.ts`, `src/lib/auth/index.ts`, `src/app/actions/auth.ts`,
`src/lib/data/team.ts`, `src/middleware.ts`, `src/lib/auth/config.ts`,
`src/components/driver/DriverLoginForm.tsx`, `src/app/entregador/page.tsx`,
`src/components/driver/DriverApp.tsx`.

---

## 8. FIM DA FASE 3

Parado aqui, conforme a instrução: **não iniciar a Fase 4 até o build ser
validado no Windows.**
