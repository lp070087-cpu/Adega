# Cadastro por link e fluxo de pedidos — 21/10/2026

## Ativação controlada

O cadastro por solicitação depende de três tabelas novas: DriverRegistrationLink, DriverApplication e DriverApplicationEvent. A migração `web/prisma/migrations/20261021210000_driver_applications/migration.sql` também substitui o índice único global Driver.userId por um índice único em (organizationId, userId). Nenhum perfil, pedido ou usuário é apagado. Essa mudança de integridade é necessária para a mesma identidade trabalhar em duas lojas e exige aprovação específica.

O recurso só pode ser ativado com `DRIVER_APPLICATIONS_ENABLED=true`, após a migração e a conferência das três tabelas e do índice. A flag está desativada por padrão. Não aplicar junto com outras migrações pendentes, incluindo o Admin Central. Os convites anteriores continuam disponíveis.

## Comportamento

- Link público `/entregador/[slug]/[numero]`: número sequencial exclusivo gerado pelo PostgreSQL, slug derivado do nome no primeiro cadastro, organização identificada pelo ID imutável. A geração é explícita pelo painel, idempotente e serializada por organização. Nomes iguais não geram colisão. O slug do link é preservado quando o nome muda; variações de URL redirecionam para o endereço canônico.
- O número não autoriza acesso. O titular escolhe senha, confirma o e-mail por token temporário de uso único, e só então é criada uma solicitação pendente. Senha permanece em hash; token é armazenado em hash. O fragmento do e-mail não vai no GET/referrer. E-mail existente exige login, sem sobrescrever senha nem duplicar a identidade.
- Resend e APP_PUBLIC_URL HTTPS são necessários para o cadastro por confirmação. Sem configuração não há envio declarado nem cadastro silenciosamente liberado. O domínio é o configurado, sem presumir domínio Del Flash próprio.
- Proprietário ou operador com MANAGE_DRIVERS aprova/rejeita com justificativa. Suspensão/revogação preservam conta global e outras lojas. Entregas atribuídas precisam ser resolvidas antes de suspender. Responsável, decisão e horário ficam no histórico. Solicitações não se aprovam sozinhas.
- A seleção da loja no app é apenas uma preferência HTTP-only. Cada consulta operacional revalida identidade, vínculo ativo, papel, perfil e revogação de sessão no banco. O seletor não concede acesso a outra organização.
- O PWA mantém seu manifest e escopo `/entregador/`; nenhum aplicativo adicional foi criado.
- Pedidos mantêm os enums e transições persistidos. O quadro e os filtros agrupam preparação/expedição da entrega em Separando; retirada tem Pronto para retirada. Histórico não é regravado. Despacho e finalização continuam condicionados às verificações de entrega/entregador existentes no servidor.

## Link da Loja 0102

O novo link numérico **não foi gerado em produção**. Após aprovação da migração/flag, o responsável deverá usar “Gerar link exclusivo da loja” em `/app/entregadores`; o número real será atribuído pelo servidor e o cartão permitirá copiar/compartilhar o endereço. Não assumir que será 0102. O convite anterior permanece em `https://adega-nine.vercel.app/entregador/convite/loja-0102`.

## Plano sujeito a aprovação

1. Confirmar o alvo Production da Vercel sem trocar DATABASE_URL/DIRECT_URL. A associação exata ainda não foi comprovada, conforme relatório administrativo anterior.
2. Preparar backup/snapshot recuperável e registrar restauração, janela e responsável. Não confiar apenas na janela móvel de seis horas.
3. Conferir tabelas/índices no alvo, duplicidades existentes de (organizationId, userId), dependências do índice antigo e histórico Prisma.
4. Após aprovação específica, executar **somente** o SQL dessa migração, em transação. Verificar preservação dos registros e integridade. Não executar migrate deploy com todas as pendências.
5. Após aprovação, ativar DRIVER_APPLICATIONS_ENABLED na Vercel. Configurar o provedor de e-mail e URL pública real. Gerar o link pelo painel da organização correta.
6. Testar com identidades autorizadas: verificação de e-mail, pendente sem pedidos, aprovação, duas lojas, troca de contexto, rejeição, suspensão e revogação. Não criar pedidos ou alterar credenciais reais para testar.
7. Se falhar antes do COMMIT, confirmar rollback. Depois de ativado, desativar a flag preserva novos registros; não restaurar índice global se já houver uma identidade em duas lojas. Não apagar tabelas para reverter código. Restauração de backup exige aprovação e consideração de operações posteriores.

## Validação

- Prisma generate e Prisma validate aprovados.
- Migração executada com sucesso em PostgreSQL PGlite inteiramente em memória, sem ler .env ou receber URL externa. Verificados: preservação de perfil legado, duas lojas com a mesma identidade, unicidade por loja, números exclusivos para nomes iguais, duplicidades de solicitação e integridade do histórico. A primeira tentativa esgotou memória; a repetição isolada com um compilador WebAssembly passou.
- Última rodada concluída: 22 testes de autenticação e solicitações aprovados. A rodada anterior também validou checkout, convites, entregas, escalas, reatribuição e PWA; duas falhas de dependências dos testes isolados foram corrigidas e repetidas com sucesso. A contagem final após as últimas alterações será registrada abaixo.
- O computador dispõe de cerca de 4 GB de RAM. A tentativa de tipos com limite de 512 MB esgotou heap; a repetição com 1024 MB está pendente nesta atualização. Foi preparado o modo local DEL_FLASH_LOW_MEMORY_BUILD=true para usar um trabalhador de build, mantendo as verificações. Isso não altera variáveis da Vercel nem desativa TypeScript.
- Não há teste autenticado de entregador novo em produção antes de aprovar a migração, configurar e-mail e disponibilizar identidade de teste. Não houve escrita operacional no Neon.
- Commit, build final, deploy e revisão visual permanecem pendentes até concluir a validação. Não publicar enquanto houver falha crítica de validação.

## Validação final — 22/10/2026

- 72 testes direcionados aprovados (solicitações, acesso, fluxo/convite/PWA/reatribuição/escala/disponibilidade/falha do entregador, checkout, conta do cliente, proprietário da plataforma).
- `prisma validate` aprovado. `tsc --noEmit` aprovado após corrigir `defaultValue` nulo no seletor de loja (`/entregador`).
- `next build` aprovado (modo local DEL_FLASH_LOW_MEMORY_BUILD=true).
- Publicado com a flag desativada; sem migração aplicada no Neon. O recurso permanece inativo até a aprovação descrita acima.
