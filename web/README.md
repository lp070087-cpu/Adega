# Delivery Platform

Base SaaS multi-tenant para delivery, construída em Next.js a partir dos
protótipos HTML que continuam na raiz do repositório.

Os arquivos `plataforma.html`, `site.html`, `entregador.html`, `admin.html`,
`super-admin.html`, `loja-data.js` e `index.html` **não foram apagados** e
seguem sendo a referência visual e funcional. Nada aqui foi desenhado do
zero: o CSS, a navegação e as telas vieram de lá.

---

## O que já funciona

| Área | Rota | Situação |
| --- | --- | --- |
| Cadastro e login | `/cadastro`, `/login` | senha com bcrypt (custo 12), sessão JWT |
| Onboarding | `/onboarding` | 4 passos: segmento → identidade → categorias → produtos e preços |
| Painel | `/app/dashboard` | indicadores, gráficos SVG, pedidos recentes |
| Central de Pedidos | `/app/pedidos` | kanban, mudança de status validada no servidor |
| Catálogo | `/app/catalogo` | produtos próprios e cópia da biblioteca global |
| Estoque | `/app/estoque` | movimentos, ajuste com rastro |
| Clientes | `/app/clientes` | histórico por telefone |
| Entregadores | `/app/entregadores` | frota, login opcional, situação |
| Expedição | `/app/expedicao` | fila de despacho + radar de posições |
| Caixa | `/app/caixa` | turnos, sangria, fechamento |
| Vendas | `/app/vendas` | por período, forma de pagamento |
| Relatórios | `/app/relatorios` | tempos de entrega, produtos, ocupação |
| Minha Loja | `/app/minha-loja` | identidade, endereço, entrega, situação |
| Equipe | `/app/equipe` | pessoas, papéis, convites |
| Integrações | `/app/integracoes` | credenciais cifradas, eventos recebidos |
| Configurações | `/app/configuracoes` | uso, infraestrutura, permissões |
| Loja pública | `/loja/[slug]` | vitrine, carrinho, checkout |
| App do entregador | `/entregador` | entregas atribuídas, passos, GPS pontual |

---

## Como rodar

```bash
cd web
cp .env.example .env      # preencha DATABASE_URL, DIRECT_URL e AUTH_SECRET
npm install
npm run db:push           # cria as tabelas no banco
npm run db:seed           # popula a biblioteca global de produtos
npm run dev
```

Para gerar o `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### Variáveis obrigatórias

`DATABASE_URL` (conexão pooled do Neon), `DIRECT_URL` (conexão direta, usada
pelas migrations) e `AUTH_SECRET`. Sem elas a aplicação não sobe.

`TOKEN_ENCRYPTION_KEY` é obrigatória apenas para salvar credencial de
integração. Sem ela, a área de Integrações **recusa** gravar — de propósito:
um segredo em texto puro é pior que uma integração desligada.

---

## Decisões que valem explicar

**O `organizationId` nunca vem do navegador.** Ele é lido da sessão assinada
e reconferido no banco a cada requisição (`requireOrg`). Nenhuma página de
`/app` aceita um id de loja pela URL — a única chave pública é o `slug` da
loja, resolvido no servidor em `/loja/[slug]`. Toda função de dados recebe
`organizationId` como primeiro parâmetro e ele está sempre no `where`.

**O preço não vem do cliente.** No checkout o servidor busca os produtos no
banco, confere que são daquela loja, que estão ativos, recalcula preço,
adicionais, variação e frete, e grava o total que ele mesmo apurou. Um
carrinho adulterado no DevTools é ignorado — o schema de entrada nem tem
campo de preço.

**Esconder um botão não é segurança.** Cada página chama `requireOrgPage`,
cada server action chama `requirePermission`, e o papel é lido do banco, não
do token. Se alguém for rebaixado, o efeito é imediato.

**Nada de base64 no banco.** Imagens entram por URL. Upload real depende de
um provedor (`src/lib/storage.ts`), que ainda não está configurado — e a
interface diz isso em vez de fingir.

**A biblioteca de produtos é central.** Coca-Cola 350ml existe uma vez em
`GlobalProduct` e é referenciada por quantas lojas quiserem. O que a loja
copia é a linha do catálogo dela, com preço e estoque próprios; a imagem
continua sendo a mesma (`src/lib/catalog-images.ts`). Trocar de CDN depois é
uma linha.

---

## O que NÃO está pronto

Vale ser explícito, porque a interface também é:

- **Adapters de marketplace.** iFood, 99Food e Zé Delivery têm o webhook
  idempotente funcionando e a credencial cifrada, mas a busca ativa de
  pedidos não foi implementada. A tela de Integrações diz isso, provedor por
  provedor.
- **Upload de imagem.** Sem provedor configurado, só URL.
- **Mapa real.** A Expedição mostra um radar de posições relativas, não um
  mapa de ruas — isso exige uma chave do Google Maps. Está escrito na tela.
- **Rastreamento contínuo do entregador.** O navegador não entrega GPS com a
  aba fechada. O envio é manual e pontual.
- **Prova de entrega por foto e assinatura.** Depende de storage.
- **Repasse de comissão ao entregador.** Os valores exibidos são dos pedidos.
- **Cobrança/assinatura da plataforma.** Não existe.
- **Notificações push.** O app do entregador não avisa sozinho.

---

## Estrutura

```
web/
  prisma/schema.prisma        modelo de dados (ver abaixo)
  prisma/seed.ts              biblioteca global — idempotente
  public/catalog/             acervo central de imagens (ver README próprio)
  src/app/                    rotas (App Router)
  src/app/actions/            server actions — única porta do cliente ao banco
  src/lib/auth/               Auth.js, guards, hash
  src/lib/data/               consultas; todas começam por organizationId
  src/lib/validations/        schemas Zod, validados só no servidor
  src/components/             interface
  src/data/                   catálogo global, textos por segmento
```

### Modelos principais

`Organization` é o tenant. Todo dado operacional pende dela:
`OrganizationUser`, `Product`, `Category`, `Order`, `Customer`, `Driver`,
`Delivery`, `CashRegister`, `StockMovement`, `StoreBanner`, `Integration`.

Fora do tenant, porque são da plataforma: `GlobalCategory`, `GlobalProduct`,
`GlobalProductBusinessType`.

---

## Scripts

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:push      # aplica o schema sem migration
npm run db:migrate   # cria migration versionada
npm run db:seed      # biblioteca global (idempotente)
npm run db:studio    # Prisma Studio
```

---

## Estado da verificação

O ambiente onde esta migração foi escrita **não tinha shell funcional**
(falha de montagem do compartilhamento de arquivos). Consequência prática e
sem rodeios: `npm install`, `prisma generate`, `prisma validate`, `next
build` e `tsc --noEmit` **não foram executados**. O código foi escrito e
revisado por leitura, cruzando cada chamada com o schema, as assinaturas das
funções e as permissões — mas isso não substitui o build.

Antes de qualquer deploy, rode na sua máquina:

```bash
npm install && npm run typecheck && npm run build
```

Se algo não compilar, o erro estará em um destes três lugares, porque foram
escritos sem compilador: (1) nome de campo do Prisma, (2) tipo de retorno de
server action, (3) import não usado. Nenhum deles muda o desenho — são
ajustes de mecânica.
