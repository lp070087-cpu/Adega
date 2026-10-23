# Entregadores, mapa, textos e publicação — 2026-10-23

## Entregadores
- Cadastro pela loja (nome + e-mail) em Entregadores → Adicionar entregador. Link único permanente por loja: `/entregador/loja/<slug>`, com Copiar link, Compartilhar pelo WhatsApp, Abrir aplicativo e Adicionar entregador.
- Primeiro acesso e recuperação: código de 6 dígitos enviado ao e-mail cadastrado, digitado na própria tela (funciona no app instalado). Sem aprovação da loja. Detalhes de segurança em `ACESSO-INDIVIDUAL-ENTREGADORES.md`.
- Removidos: autocadastro com aprovação, links numerados por loja e convite com senha pré-escolhida (nunca ativos em produção).
- Loja: editar, suspender/reativar (só nesta loja), remover vínculo (histórico preservado). "Ativação pendente" virou "Aguardando primeiro acesso".
- Mensagens de regra de negócio do cadastro de entregadores agora chegam ao lojista (antes apareciam como erro genérico).

## Mapa
- Configurações → Minha Loja → Entrega: mapa de ruas real (Leaflet 1.9.4 + tiles OpenStreetMap), marcador arrastável, tocar no mapa, busca pelo endereço (Nominatim, resultado apresentado como aproximado), localização do aparelho com precisão informada e tratamento de permissão negada/tempo esgotado/https, círculo do raio em linha reta, bairros com coordenada, zoom/arrastar, coordenadas manuais, salvar. Sem coordenada não há marcador inventado.
- "Abrir rota" do entregador: Google Maps parte da posição atual do aparelho (antes partia da loja); Waze usa a coordenada exata (`ll=`).

## Textos e acessibilidade
- Mojibake residual corrigido (mapa, tailwind.config), BOMs removidos, detector ampliado em `tests/encoding.test.ts` (src, prisma, scripts, configs). Banco de produção: 0 textos corrompidos (consulta só de leitura).
- Rótulos de formulário do painel agora associados aos campos (componente `Field`).
- Formulários com senha (entregador, cliente da loja) funcionam antes da hidratação via POST; senha nunca em URL. Páginas com formulário usam `Referrer-Policy: same-origin` (com `no-referrer` o navegador enviava `Origin: null` e o envio falhava).

## Banco
- Migração `20261021210000_driver_applications` substituída por `20261023090000_driver_multistore` (só troca `Driver_userId_key` por `(organizationId, userId)`).
- Ensaio no branch isolado `teste-migracao-entregadores-2026-10-23` (`br-rough-band-aclh72na`, criado da produção): as 5 migrações pendentes aplicadas em uma transação; usuários 4, entregadores 3, vinculados 3, aguardando primeiro acesso 2 — idênticos antes e depois. Produção não foi alterada.
- Pendente de autorização: aplicar as migrações na produção (multiloja depende de `20261023090000_driver_multistore`).

## Testes
- Unitários: 237/237. TypeScript e build sem erros.
- E2E entregador: 14/14 (cadastro, código errado recusado, senha, login, recuperação de legado, e-mail desconhecido, duas lojas, troca de loja, suspensão por loja, reativação, remoção de vínculo, conta da loja no link, link inexistente).
- E2E schema de produção (sem migração e sem e-mail): 4/4. Mapa: 7/7 (tiles simulados no ambiente de teste). Rede lenta/queda: 2/2. Responsividade 320–1280 px em 12 telas: 0 problemas.

## Configuração pendente na Vercel
`RESEND_API_KEY`, `MAIL_FROM`, `APP_PUBLIC_URL=https://adega-nine.vercel.app`. Até lá o primeiro acesso por código fica fechado com aviso; quem já tem senha entra normalmente.
