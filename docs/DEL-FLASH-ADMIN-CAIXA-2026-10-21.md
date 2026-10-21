# Admin Central, conferência financeira e moeda — 21/10/2026

Base preservada: código `265e4c1`, relatório `b235321`, branch `main`. Nenhuma alteração operacional, migração, concessão OWNER, troca de conexão ou movimentação financeira foi executada em produção.

## Correções de código

### Admin Central

- Link movido para imediatamente depois de Configurações, dentro da navegação rolável, inclusive no celular. Só aparece quando o servidor confirma um PlatformOperator global ativo. Não depende da string de e-mail no frontend nem do papel de proprietário de estabelecimento.
- Mantidas as proteções de páginas, ações e serviços administrativos no servidor, com flag de ativação, conferência das seis tabelas e consulta de conta/operador ativos.
- Suporte em `/admin/suporte/acessos`: consulta operacional temporária de estabelecimento ou entregador, exclusiva de OWNER/ADMIN/SUPPORT globais. Cada concessão dura 15 minutos e fica vinculada ao operador, organização e eventual entregador. Criação, leitura e revogação são auditadas. A autorização global é reavaliada em cada chamada; expiração, revogação e operador diferente bloqueiam acesso.
- A consulta é **somente leitura**, com últimos 30 pedidos e até 50 entregadores, sem telefone, endereço ou credenciais de clientes. Não troca cookies, papel ou identidade, não cria vínculos de funcionário/entregador e não delega mutações operacionais. Não é impersonação nem acesso irrestrito ao aplicativo do motorista.
- A funcionalidade utiliza PlatformSetting e PlatformAudit da migração já pendente. Não acrescenta outra migração e permanece inacessível antes da ativação autorizada.

### Caixa

- Conferência separada de dinheiro, débito, crédito e Pix; online/outras formas aparecem quando há movimentação correspondente, inclusive saldo líquido zero.
- Esperado recalculado no servidor a partir de abertura e transações reais. Estornos digitais reduzem seu próprio meio, sem reduzir a gaveta. Suprimento, sangria e ajuste continuam afetando somente dinheiro físico.
- Operador informa valores e observações por forma; diferenças individuais e total consolidado ficam visíveis. Divergências exigem justificativa específica ou geral, mesmo quando sobra e falta se compensam no total.
- Fechamento guarda relatório imutável por turno em `Organization.settings.cashReconciliations`, com responsável e horário, dentro da mesma transação de encerramento. Não altera vendas antigas nem gera transações para “fazer bater” os totais. Histórico legado sem conferência é preservado.
- Passagem mantém conferência anterior no histórico. Novo operador precisa continuar ativo/autorizado e aceitar o dinheiro efetivamente contado. Apenas esse dinheiro vira abertura do novo turno; cartões/Pix não são transportados como troco. Lock por organização e estado fechado/pendente impedem repetição de fechamento/transferência/aceite.
- Conferência é marcada OPERATOR_CHECKED: não representa liquidação nem conciliação automática com adquirente, banco ou gateway.

### Moeda

- Campo compartilhado mantém rascunho textual durante a edição, permitindo apagar e digitar vírgula sem reposicionar centavos. Apresentação e blur usam pt-BR, símbolo R$ e milhares.
- Parser compartilhado aceita `0,01`, `10,50`, `1.234,56`, `10.000,00` e entradas decimais compatíveis; rejeita agrupamentos inválidos e mais de duas casas. Não multiplica automaticamente o número digitado por 100.
- Formulários de planos, campanhas e troco passaram a usar campo de moeda; ações correspondentes fazem leitura brasileira no servidor. Catálogo, adicionais, combos, configurações e edição inline monetária do estoque foram ajustados sem modificar registros existentes.
- Cálculos de conferência usam centavos inteiros; valores persistidos seguem os decimais/JSON existentes na arquitetura. Nenhuma conversão em lote foi feita no banco.

## Inspeção administrativa somente de leitura

O script `web/scripts/platform-owner.ts`, **sem flags de aplicação**, confirmou no banco da configuração local:

- Uma conta ativa `lp070087@gmail.com`, ID `cmu0pypp60000jm9opt2k0l7j`.
- As seis tabelas PlatformOperator, PlatformContract, SaaSCharge, PlatformAudit, PlatformSetting e PlatformSupportCase estão ausentes.
- Portanto não existe concessão central utilizável nesse alvo. Não foi criado usuário ou privilégio.

Essa consulta **não comprova que a Vercel usa a mesma conexão**. Não confundir `.env` local com ambiente Production remoto.

## Neon/Vercel e backup — bloqueio real

Após o proprietário informar a conexão, as duas sessões web foram testadas e estão autenticadas. O catálogo de ferramentas ainda informa os plugins como não instalados; a consulta foi feita pelos sites oficiais, sem pedir novamente credenciais ou conexão.

Na Vercel foi confirmado o projeto `adega`, equipe `lp070087-5894s-projects`, ambiente **Production**, branch Git `main` e domínio `adega-nine.vercel.app`. DATABASE_URL e DIRECT_URL constam nesse ambiente como **Secret**. A interface informa que os valores salvos são somente de escrita e não podem ser revelados. O formulário foi aberto apenas para inspeção e cancelado, sem salvar. Portanto, seus endpoints não puderam ser confrontados com o Neon. **Ainda não é possível comprovar qual projeto atende a produção da Vercel.** Não inferir a associação a partir da configuração local, nomes ou atividade recente.

No Neon foram confirmados por leitura:

- Projeto existente `delivery-platform`, ID `square-sea-87088302`.
- Branch `production`, ID `br-royal-dust-ac3fp5wz`, padrão.
- Banco `neondb`, proprietário `neondb_owner`, região São Paulo.
- Projeto novo `Del flash`, ID `sweet-cloud-90184757`, também listado. Não foi conectado à aplicação nem modificado.

Esses dados identificam o projeto existente inspecionado, mas não comprovam por si só sua associação às variáveis secretas da Vercel. Falta acesso de leitura autorizado aos metadados/valor protegido da conexão de produção, com extração apenas de host e nome do banco, sem publicar credenciais.

Não houve alteração de URLs, conexão ao projeto novo, cópia de dados, exclusão de projeto ou criação de banco/branch. Nenhuma senha, token ou URL com credenciais foi incluída neste relatório.

**Recuperação disponível no projeto existente:** Backup & Restore confirma PITR com janela móvel de **6 horas** na branch production. Na inspeção, o limite mais antigo era 21/10/2026 às 10:37 GMT-3. A interface mostra **No snapshots, no schedule set**. Não foi criado snapshot, backup externo, branch ou restauração de teste. Portanto existe capacidade de recuperação por histórico, mas não um snapshot durável ou uma restauração efetivamente testada. Não considerar essa janela móvel uma cópia permanente. A execução administrativa continua bloqueada até confirmar o alvo, estabelecer um ponto recuperável adequado à intervenção e obter aprovação.

## Plano de ativação — somente após autorização específica

1. Acessar o projeto Vercel `adega`, ambiente **Production**, na equipe correta. Inspecionar DATABASE_URL e DIRECT_URL em contexto protegido; comparar somente hostname/endpoint e banco com os metadados Neon. Registrar nome/ID de projeto, branch e endpoint sem credenciais. Não trocar variáveis. Se pool e conexão direta divergirem de alvo, interromper antes de qualquer escrita.
2. No projeto/branch Neon identificado, comprovar janela de recuperação/PITR ou backup consistente e registrar o ponto anterior à intervenção. Confirmar um procedimento de restauração testado em ambiente previamente autorizado. Não criar branch ou banco adicional automaticamente.
3. Repetir a inspeção readonly no **alvo confirmado**, verificando usuário por ID/e-mail/estado, ausência/conflito das seis tabelas, schema legado e histórico de migrações. Conferir titularidade da conta; não criar conta alternativa.
4. Revisar `web/prisma/migrations/20261019180000_platform_commercial/migration.sql`: seis tabelas novas, índices, sete FKs e dez CHECKs, instruções ALTER somente nas tabelas novas, transação BEGIN/COMMIT. User, Organization e Plan são referências; seus registros/colunas não são convertidos ou apagados. Não executar migrate deploy indiscriminadamente: há outras migrações pendentes, inclusive a área do cliente.
5. Após aprovação explícita da aplicação das seis tabelas, executar na pasta `web` e na conexão de produção **confirmada**: `npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261019180000_platform_commercial/migration.sql`. Conferir integralmente tabelas, índices, FKs e CHECKs após COMMIT. Baseline/histórico Prisma requer conferência própria, sem marcar migrações não executadas.
6. Após aprovação explícita da concessão ao ID confirmado, executar o bootstrap preparado: `node --env-file=.env --import tsx scripts/platform-owner.ts --apply-approved --user-id cmu0pypp60000jm9opt2k0l7j --approval "REFERENCIA DA APROVACAO ESPECIFICA"`. Esse `.env` deve ser o ambiente protegido cujo alvo já foi comprovado; não usar a conexão local por suposição. Script é idempotente, verifica identidade novamente e grava OWNER e auditoria na mesma transação. Não imprime segredos.
7. Após aprovação explícita da ativação, configurar `PLATFORM_ADMIN_ENABLED=true` na produção. Manter bloqueio comercial desativado. Testar login real, link abaixo de Configurações, acesso direto e negativa para proprietários comuns; testar suporte com concessão temporária sem alterar dados operacionais.
8. Falha antes do COMMIT: confirmar rollback transacional antes de repetir. Após ativação: desligar a flag para bloquear o acesso e preservar tabelas/auditoria; não executar DROP para reverter código. Qualquer restauração ou mudança de privilégio deve seguir a janela e a aprovação específicas, considerando dados posteriores ao backup.

## Validação e publicação

- Código publicado: `bea2d0954f52b024c4d0721c18a4839dc68a2b1a` (`bea2d09`), em origin/main.
- Deploy confirmado pelo status oficial Vercel: **success — Deployment has completed**. [Deploy](https://vercel.com/lp070087-5894s-projects/adega/Aqyrjroa2nDoaUanpfAXKGJLPHkT).
- 220 testes aprovados na implementação; última rodada direcionada com 19 testes aprovados, sobrepostos à suíte, cobrindo as últimas alterações. Não somar as contagens. A suíte completa não foi repetida nesta retomada, pois não houve nova alteração de código.
- TypeScript, Prisma validate e build de produção aprovados antes da publicação.
- Navegador real autenticado como proprietário: página Caixa publicada carregada, modal de fechamento com dinheiro/débito/crédito/Pix e observações verificado. Digitação seguida de blur preservou exatamente `0,01`, `10,50`, `1.234,56`, `10.000,00`; limpeza do campo permaneceu vazia. Modal cancelado ao terminar. Nenhum fechamento, transferência ou lançamento real foi submetido.
- Screenshot desktop salvo. A tentativa de alterar viewport não mudou a largura real da aba (permaneceu 1224 px); por isso **não há aprovação visual mobile nesta verificação**. Override restaurado.
- Conferências financeiras, concorrência, permissões e suporte administrativo foram testados com mocks; não representam fechamento financeiro real, sessão central ativada ou conciliação bancária.

## Aprovações ainda necessárias

Não executar enquanto o alvo de produção continuar sem confirmação. Após resolver essa leitura, submeter separadamente: (1) criação de snapshot/backup recuperável e eventual teste de recuperação em destino autorizado; (2) execução exclusiva do SQL aditivo das seis tabelas, no alvo confirmado; (3) concessão idempotente de OWNER somente ao User.id verificado de lp070087@gmail.com, com auditoria; (4) ativação da flag administrativa e novo deploy. A política de bloqueio comercial permanece desativada. Nenhuma dessas operações foi executada ou autorizada nesta etapa.

O link Admin Central já está programado imediatamente abaixo de Configurações, mas só aparecerá quando a autorização global válida existir e a ativação estiver concluída. Não foi simulada liberação pelo e-mail.
