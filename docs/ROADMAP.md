# Roadmap — Adega 1998 → Delivery Platform (SaaS)

> **Status:** Fase atual de evolução estática concluída (demonstração multi-tenant
> navegável em arquivos locais). A marca "Adega 1998" permanece como conteúdo
> demonstrativo de um tenant.

## O que já existe (nesta entrega)
| Arquivo | Papel |
|---------|-------|
| `index.html` | Loja (site próprio) da Adega 1998 — demo |
| `admin.html` | Painel legado da Adega (mantido intacto) |
| `plataforma.html` | **Nova Central Operacional multi-tenant** (pedidos/kanban, dashboard, catálogo, entregadores, caixa, relatórios, integrações, empresa, equipe) |
| `entregador.html` | **App do Entregador (PWA demo)** — fila, GPS, prova de entrega |
| `super-admin.html` | **Super Admin** — tenants, planos, usuários, logs |
| `integrations/` | Contrato de adapters/mappers/idempotência (docs) |
| `docs/` | Schema Prisma + roadmap |

## Arquitetura atual (100% estática)
- HTML + CSS + JS em arquivo único, persistência `localStorage`, isolamento por
  chave `dp_{tenantId}_{recurso}` e sessão `dp_session`.
- Zero dependências, roda via `file://` ou qualquer host estático.

## Próximas fases (ordem sugerida)

### Fase B — Backend fundação (Next.js + Prisma + Neon + Auth.js)
- Repositório novo (ou branch), estrutura `apps/web`, `apps/api` (rotas), `packages/`.
- Aplicar `docs/SCHEMA-PRISMA.md` como schema inicial.
- Auth.js com e-mail/senha + papéis; primeiro acesso com token.
- Portar telas de `plataforma.html` como páginas React (manter identidade visual).

### Fase C — Multi-tenant real
- Isolamento por `organizationId` em todas as queries.
- Criação de tenant (trial) e convite de usuários.
- `super-admin` autenticado protegendo a gestão da plataforma.

### Fase D — Integrações oficiais (credíveis)
- iFood: implementar autenticação e eventos reais em sandbox, depois produção.
- 99Food / Zé Delivery: seguir certificação; manter banner honesto até lá.
- Google Maps: geocoding + rota no despacho e no app do entregador.

### Fase E — Operação avançada
- Caixa com conciliação automática por origem, CRM de clientes, relatórios
  exportáveis, impressão térmica, notificações push, webhooks, planos/cobrança.

## Regras permanentes
- Preservar a estrutura visual existente; não reconstruir do zero o que funciona.
- "Adega 1998" = conteúdo demo; identidade da plataforma é "Delivery Platform".
- Integração só "funciona" com credencial real. Sem ela → MODO DEMONSTRAÇÃO.
- Segredos nunca no frontend/localStorage/git.
