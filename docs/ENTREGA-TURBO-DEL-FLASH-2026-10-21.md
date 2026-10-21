# Entrega Turbo independente

Implementação de código em 21/10/2026. Nenhum dado real, campanha, consentimento ou aviso de produção foi criado pelo agente.

## Operação

Em **Campanhas → Entrega Turbo**, configurar uma campanha própria, separada dos descontos e do programa de pontos. Disponíveis nome, validade, dias/horários, condições, mensagem, público, frequência, limite e situação. Turnos atravessando a meia-noite pertencem ao dia em que começaram; horários usam São Paulo.

Públicos: todos os elegíveis, clientes com pedido entregue nos últimos 30 dias ou seleção personalizada. Na personalização, selecionar clientes e/ou filtros de quantidade mínima de pedidos entregues e dias mínimos sem pedido. Quando combinados, os critérios são cumulativos.

Salvar não publica mensagens. Ativar exige confirmação de capacidade, loja aberta e entregador livre/online/em escala. Publicar exige outra confirmação, motivo, nova verificação de capacidade e prévia conferida. Mudança de configuração, consentimento ou audiência entre prévia e confirmação exige atualizar a prévia.

## Consentimento e avisos

- Somente avisos internos persistentes, visualizados em **Meus benefícios** pelo comprovante individual de pedido. Não são WhatsApp, e-mail ou push.
- O cliente deve marcar explicitamente o consentimento para Entrega Turbo na área identificada. Consentimentos anteriores que apenas não recusavam contato não são convertidos em opt-in.
- Descadastro prevalece e cancela o consentimento Turbo. O estabelecimento pode registrar descadastro, mas não concede o consentimento Turbo em nome do consumidor.
- Sem vínculo público por telefone. A consulta de benefícios exige o comprovante de alta entropia e a loja correspondente.
- Cada cliente recebe no máximo um aviso por campanha. Frequência considera avisos Turbo e contatos de outras campanhas. Histórico é preservado, com limite explícito e sem truncar registros.
- A audiência tem limite de 1.000 clientes avaliados por operação. Acima disso, a publicação é bloqueada com orientação para usar seleção personalizada; não há envio silencioso parcial.
- Não há prazo automático: condições são definidas e confirmadas pela loja, com aviso de capacidade operacional ao consumidor. Campanha pausada, vencida ou fora do horário é identificada como indisponível no histórico de avisos.

## Persistência e compatibilidade

Usa os campos existentes de configuração da própria organização (`growth.turboCampaigns` e `growth.turboNotices`), com transações serializadas por organização. Não requer migração. Clientes selecionados são conferidos contra a organização no servidor, assim como autorização e limites.

Registros Turbo antigos misturados a campanhas de descontos permanecem preservados em histórico somente de leitura. A regra de checkout não aplica descontos a Turbo. Configurar uma campanha independente não altera pontos, preços, frete, contratos, pedidos ou saldos existentes.

## Validação

Testes direcionados com mocks: consentimento explícito, público recente/personalizado, madrugada, validade, frequência, deduplicação, prévia somente de leitura, invalidação de prévia antiga, isolamento de clientes/organizações, bloqueio sem permissão, preservação de pontos/descontos e publicação interna auditada. TypeScript/build e revisão visual ficam na validação consolidada da entrega principal.

## Roteiro posterior

1. Em ambiente autorizado, criar rascunho e conferir condições/horários.
2. Autorizar avisos Turbo na área de benefícios de um cliente de teste; verificar que outro cliente sem consentimento fica de fora.
3. Ativar somente após conferir entregador e capacidade. Abrir prévia e conferir nomes/contagem antes de confirmar publicação.
4. Revogar consentimento após a prévia; a confirmação deve recusar e exigir nova consulta.
5. Publicar uma vez e consultar pelo comprovante correto. Repetição não pode duplicar o aviso.
6. Pausar a campanha e conferir que o histórico não sugere disponibilidade atual. Nenhum canal externo deve receber mensagens.
