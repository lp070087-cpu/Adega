# Limites comerciais

Os limites passam a valer somente com `PLATFORM_ADMIN_ENABLED=true` e contrato comercial associado à organização. Sem a flag ou sem contrato, as organizações existentes continuam sem bloqueio de capacidade. A flag exige previamente a migração comercial aprovada.

O plano associado ao contrato define a capacidade atual. `maxUsers` conta vínculos ativos de equipe, incluindo proprietários e excluindo DRIVER. `maxDrivers` conta perfis de entregador ativos, mesmo quando não têm acesso de login. O limite é validado no servidor, na mesma transação e com bloqueio da organização usado para efetuar a criação ou ativação.

Novos vínculos, reativações e conversão de DRIVER ativo para equipe consomem capacidade de usuários. Cadastro e reativação de entregadores consomem capacidade de entregadores. A criação de DRIVER pela equipe foi removida: deve ser feita em Entregadores, onde o perfil operacional e seu acesso são associados corretamente.

Uma redução de plano nunca desativa cadastros existentes. Edição sem aumentar o uso e desativação continuam disponíveis acima do limite. Para ativar mais cadastros, o estabelecimento precisa liberar capacidade ou solicitar alteração de plano. A alteração de atividade do entregador sincroniza o vínculo de acesso DRIVER dentro da mesma transação.

Testes isolados em `web/tests/platform-quotas.test.ts`: ausência de flag/contrato, escopo por organização, contagem de usuários e entregadores, limite zero, capacidade livre, bloqueio antes da escrita, reativação, conversão de papel e preservação da edição/desativação acima da capacidade. Nenhum teste escreve no banco.
