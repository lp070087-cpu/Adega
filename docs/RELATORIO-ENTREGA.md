# Relatório de entrega — Adega 1998 vira Delivery Platform

**Data:** 2026-09-04
**Escopo da fase:** fundação multi-tenant sem quebrar o existente + novo painel operacional + app do entregador + super admin + modelagem de integrações/banco.

---

## A. O que foi preservado (intocado)
| Arquivo | Observação |
|---------|------------|
| `index.html` | Loja (site próprio) da Adega 1998 — intacto |
| `admin.html` | Painel legado da Adega — intacto (login corrigido em fase anterior) |
| `Public produtos/` | Imagens reais — intactas |
| `.git/` | Repositório preservado (remoto `lp070087-cpu/Adega`) |

## B. O que foi criado
| Arquivo | Papel | Como testar |
|---------|-------|-------------|
| `plataforma.html` | **Central Operacional multi-tenant** — login, kanban de pedidos (8 colunas), origem, dashboard, catálogo, entregadores/despacho, caixa, relatórios, integrações, empresa, equipe | Abrir no navegador → escolher tenant/perfil → senha `demo` |
| `entregador.html` | **App do Entregador (PWA demo)** — fila de entregas, GPS, prova de entrega (assinatura + foto) | Abrir → escolher tenant e entregador → senha `1234` |
| `super-admin.html` | **Super Admin** — visão geral, tenants, planos, usuários, logs | Abrir → credenciais demo |
| `integrations/` | Contratos de integração (README, provider, order, idempotência) | Leitura |
| `docs/` | Schema Prisma, roadmap, este relatório | Leitura |

## C. Isolamento multi-tenant
- Dados por tenant gravados em `dp_{tenantId}_{recurso}` no `localStorage`.
- Sessão separada: painel `dp_session`, entregador `dp_entregador_session`, super admin `dp_sa_logged`.
- Troca de empresa no painel = logout → novo login (nunca mistura dados).
- Cada tenant tem produtos/orders/caixa/entregadores próprios.

## D. Central de Pedidos (kanban)
Colunas: **Novos → Confirmados → Em preparo → Prontos → Aguard. entregador → Saiu p/ entrega → Entregue** + **Cancelado**.

Cada card mostra: número, origem (badge colorida), cliente, resumo, obs, tempo desde criação, total, pagamento e ação principal. Click abre **drawer** com itens, totais, observações, linha do tempo e ações contextuais. Filtros por origem no topo.

## E. Origens e honestidade nas integrações
- Badges: Site / iFood / 99Food / Zé Delivery / Balcão / WhatsApp.
- Pedidos de marketplace gerados na demo usam `source` e rótulo de demonstração; **nenhuma** chamada real.
- Tela **Integrações** mostra iFood/99Food/Zé como **"Modo demonstração — aguardando credenciais"** e botão "Testar conexão" que **não simula sucesso**.
- Configurar integração deixa claro que segredo nunca vai para o frontend.

## F. App do Entregador
- Login por tenant + entregador (senha demo `1234`).
- **Entregas**: pedidos atribuídos ao entregador (compartilham storage da Central).
- Fluxo: Iniciar rota (GPS) → Cheguei → Prova de entrega (nome de quem recebeu, assinatura opcional, foto) → confirma e grava `delivered` + contabiliza corridas/valores.
- **Histórico** e **Perfil** (corridas, a receber, disponibilidade).

## G. Super Admin
- Login demo: `admin@deliveryplatform.com.br` / `sa-admin-2026`.
- Visão geral com métricas agregadas de todos os tenants; gestão de tenants (status, criação), planos (Starter 97 / Profissional 197 / Premium 497), usuários e logs simulados (sem credenciais).

## H. Modelagem da stack futura
- `docs/SCHEMA-PRISMA.md` — rascunho do schema Prisma multi-tenant (Organization, User/Role, Product, Order, Driver, ProviderConnection, IntegrationEvent, IntegrationLog).
- Stack preferida: **Next.js + React + TypeScript + Tailwind + Node + PostgreSQL (Neon) + Prisma + Auth.js**, deploy GitHub + Vercel. Sem Supabase/Lovable.

## I. Decisões técnicas
- **Preservação visual:** o novo painel reusa o design system da Adega (CSS vars, fontes, cards, badges) para parecer continuação, não app estranho.
- **Storage:** helpers `storeGet/storeSet/storeRemove` com try/catch (padrão do login fix) em todos os arquivos novos — seguros em `file://`.
- **Idempotência:** contrato documentado; `externalId+organizationId` como chave única.

## J. Pendências / próximos passos
- Rodar validação de sintaxe e testes de UI quando o ambiente de shell voltar (VM do sandbox ficou fora do ar nesta sessão; validação foi estática).
- Migrar para backend real (Fase B do roadmap) com os contratos aqui definidos.
- Integrações reais só após credenciais/homologação.

## K. Instruções rápidas de teste manual
1. Abra `plataforma.html` → selecione **Adega 1998**, perfil **Administrador**, senha `demo`.
2. Na Central, use **📥** (topo) para simular chegada de pedido externo; avance os cards pelas colunas.
3. Abra um card (drawer), teste ações. Troque de empresa no menu lateral (logout).
4. Abra `entregador.html` → mesmo tenant, escolha **Carlos Andrade**, senha `1234` → veja pedidos atribuídos, inicie rota, finalize com prova.
5. Abra `super-admin.html` → credenciais demo → veja os 3 tenants refletidos.
6. O antigo `admin.html` e `index.html` continuam funcionando como antes.

## L. Backups
Nenhum arquivo existente foi sobrescrito nesta fase. Backups de fases anteriores
permanecem: `admin.html.bak*` e `Apresentação do site.html.bak*`. Novos arquivos
vivem ao lado dos antigos e não alteram a operação atual da Adega.

## M. Arquivos novos nesta fase (resumo para o usuário)
```
Desktop/Adega/
├── plataforma.html      (nova Central Operacional multi-tenant)
├── entregador.html      (novo app do entregador, PWA demo)
├── super-admin.html     (novo Super Admin da plataforma)
├── docs/
│   ├── RELATORIO-ENTREGA.md
│   ├── ROADMAP.md
│   └── SCHEMA-PRISMA.md
└── integrations/
    ├── README.md
    ├── delivery-provider.md
    ├── normalized-order.md
    └── idempotency.md
```

## N. Perfis e credenciais demo
| Sistema | Credenciais |
|---------|-------------|
| `plataforma.html` (Central) | tenant à escolha • perfil à escolha • senha `demo` |
| `entregador.html` (Entregador) | tenant à escolha • entregador à escolha • senha `1234` |
| `super-admin.html` | `admin@deliveryplatform.com.br` / `sa-admin-2026` |
| `admin.html` (Adega legado) | `dona@adega1998.com.br` / `admin123` (mantido) |

> Todos os dados são demonstrativos e locais. Nenhuma credencial real de
> marketplace foi usada ou armazenada.
