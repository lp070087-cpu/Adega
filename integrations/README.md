# Delivery Platform — Integrações

> ⚠️ **Nada aqui conecta em produção.** Este módulo é 100% documental/estrutural e existe para (1) descrever o contrato, (2) servir de base do backend real (Next.js + Prisma), e (3) **nunca enganar**: sem credencial oficial, o sistema só exibe "MODO DEMONSTRAÇÃO / AGUARDANDO CREDENCIAIS".

## Princípios de segurança
- Credenciais (client_secret, api_key, token) **nunca** vão para o frontend, `localStorage` ou repositório git.
- No backend real, vivem em variáveis de ambiente / secret manager e são usadas **somente no servidor**.
- Esta pasta está em `.gitignore` recomendado para qualquer rascunho com segredo (nenhum existe aqui).

## Canais planejados

| Canal | Tipo | Status real | Credencial necessária |
|-------|------|-------------|------------------------|
| Loja própria (site) | Pedidos diretos no catálogo | Conectado (demo) | Nenhuma |
| iFood | Marketplace | Aguardando homologação | Merchant API / client_id+client_secret |
| 99Food | Marketplace | Aguardando credenciais | Credenciais do parceiro |
| Zé Delivery | Marketplace | Aguardando aprovação comercial | Seller Public API (client_credentials) |
| Google Maps | Geocoding / rotas | Não conectado | API Key (somente backend) |
| WhatsApp | Pedidos via mensagem | Manual (sem BSP) | — (futuro: API oficial Meta) |

## Arquitetura de adapters
Ver `delivery-provider.md` e `normalized-order.md`.
