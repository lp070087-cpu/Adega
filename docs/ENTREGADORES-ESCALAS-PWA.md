# Entregadores — escalas e instalação

Implementação de 20/10/2026. Nenhum dado de produção foi gravado para desenvolver/testar esta frente. Nenhuma migração é necessária para escalas, lembretes ou instalação.

## Instalação

`/app/entregadores` oferece link copiável para `/entregador/instalar`, com instruções Android/Chrome e iPhone/Safari. O botão de instalação aparece somente quando o navegador disponibiliza a opção. A instalação não cria sessão nem concede permissão; o acesso continua pelo login e vínculo de Driver existentes. O manifesto inicia em `/entregador`, usa ícones PNG de 192/512 e ícone maskable existente. Os PNG foram renderizados do SVG já pertencente ao projeto.

O service worker `public/driver-sw.js` atende apenas navegações GET sob `/entregador`. Usa rede com `no-store`, sem Cache API, sem armazenamento de páginas privadas e sem interceptar POSTs/APIs. Sem conexão, mostra mensagem estática sem dados. Não confirma, enfileira ou sincroniza alterações offline. Não implementa push, GPS contínuo nem promessa de instalação em todo navegador. A validação de instalação em aparelhos reais permanece manual.

## Escalas

Configuração persistida em `Organization.settings.driverSchedules[driverId]`, preservando todas as outras chaves JSON. Não substitui Driver nem as associações existentes. Exemplo:

```json
{"enabled":true,"timezone":"America/Sao_Paulo","shifts":[{"day":1,"start":"18:00","end":"02:00","breaks":[{"start":"23:30","end":"00:15"}]}]}
```

Dia 0 = domingo, 6 = sábado. Até 28 turnos semanais e quatro intervalos por turno. Fim anterior ao início cruza a madrugada. Turnos e intervalos sobrepostos são rejeitados, incluindo sábado/domingo. Intervalos precisam caber no turno. Escala habilitada com dia sem turno significa folga. Ausência de configuração ou escala desabilitada preserva disponibilidade legada. Configuração habilitada inválida bloqueia novas atribuições.

Somente `MANAGE_DRIVERS` pode salvar; o estabelecimento vem da sessão e o Driver é conferido no mesmo tenant. Salvamento usa a trava transacional existente da organização. Registro SYSTEM em Notification conserva operador, configuração anterior e nova como histórico operacional; não é um sistema independente de auditoria imutável.

`assertDriverOnShift` é usado na atribuição e disponibilidade ONLINE. Escala/intervalo não interrompem uma entrega em curso. O sistema impede liberar manualmente como disponível ou desativar um entregador com pedidos WAITING_DRIVER/DISPATCHED. BUSY é derivado da atribuição. Pedidos e Expedição exibem disponibilidade, quantidade em andamento e situação da escala; opções inelegíveis ficam indisponíveis e o servidor reconfere a operação.

Troca de entregador usa a operação atômica de reatribuição: apenas antes da retirada, outro entregador disponível/em escala, motivo de 5–300 caracteres, histórico com operador e preservação da contabilidade/estoque. Se a nova atribuição falhar, a anterior permanece. A interface também oferece remoção antes da retirada, conforme as regras existentes.

## Lembretes internos

Notification existente recebe um ID determinístico por organização/entregador/data. Ao salvar a escala, abrir o painel/app ou conferir manualmente, os lembretes do próximo dia são gerados/atualizados sem duplicação. Alteração de horário atualiza o texto e marca não lido; folga/desativação remove somente o lembrete correspondente de amanhã. Com login, o destinatário é o usuário do entregador; sem login, permanece aviso da organização.

O painel/app verifica enquanto aberto e visível a cada 60 segundos, com conexão. Os lembretes são persistidos, mas não existe execução agendada com a aplicação fechada, push ou envio externo. Este comportamento é explícito: para execução independente futura é necessário configurar um agendador autenticado. O botão de conferência chama Server Action protegida; não foi aberto endpoint público de geração.

## Validação

Testes de módulos reais com imports isolados/mocks cobrem turnos/intervalos/madrugada, isolamento de configurações, preservação de settings, lembretes idempotentes e atualização/remoção, disponibilidade/deativação com pedidos ativos, worker/manifesto, retorno de tentativa sem sucesso e reatribuição transacional. Não são testes de PostgreSQL, instalação física ou E2E com pedidos reais.

Teste manual posterior: cadastrar entregador de teste em ambiente isolado; configurar dois turnos no mesmo dia, intervalo e madrugada; conferir que a seleção só permite atribuir dentro do turno e sem pedido ativo; trocar antes da retirada com motivo e conferir histórico; tentar trocar após retirada e conferir recusa; modificar escala de amanhã e conferir atualização sem aviso duplicado; deixar amanhã de folga e conferir remoção; instalar no Chrome Android e Safari iPhone; entrar, testar reconexão, navegação externa e concluir uma entrega de teste. Não criar dados reais automaticamente para cumprir esse roteiro.
