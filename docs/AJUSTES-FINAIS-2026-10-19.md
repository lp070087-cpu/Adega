# Ajustes finais — 19/10/2026

Base: fd3c16c, main. Código existente preservado. Sem escrita de dados no Neon,
migração, seed, concessão global, criação de pedido ou pagamento nesta execução.

## Administração central

A conta lp070087@gmail.com existe uma única vez, ativa, ID
`cmu0pypp60000jm9opt2k0l7j`. As seis tabelas centrais estão ausentes.
A tabela `_prisma_migrations` existe, mas não contém registros. Não assumir
que há baseline Prisma aplicada. A migração versionada é aditiva: seis tabelas,
nove índices adicionais, sete FKs RESTRICT, dez CHECKs; não modifica colunas
ou dados legados. Aplicação, recuperação e concessão idempotente auditada estão
em [ADMIN-COMERCIAL-ATIVACAO.md](ADMIN-COMERCIAL-ATIVACAO.md).

Não foi concedido OWNER nem ativada flag. A restrição comercial permanece
desativada. O script de bootstrap é somente leitura por padrão e exige conta,
ID e aprovação específicos para futura escrita. Não está exposto em rota web.

## Banners: causa e correção

Consulta de leitura encontrou ZERO StoreBanner, inclusive padrões da plataforma.
Logo, a vitrine não recebe slides: a existência de arquivos em public não cria
registros de banners. Os quatro PNGs já estão versionados em public/catalog/banners;
os originais de Public produtos e Banneres public são cópias idênticas por SHA256.
Não é necessário duplicá-los ou publicar o acervo original.

Dimensões: banner 01/03/04 = 1774×887; banner 02 = 1942×809. A orientação da tela
foi corrigida de 4:1 para aproximadamente 2:1. Camadas explícitas mantêm a imagem
atrás do conteúdo, com gradiente menos escuro, sem brilhos sobre artes cadastradas.
No celular a arte inteira aparece acima do texto/ações; não se perde a imagem
por corte vertical. Slides inválidos ou que falhem são retirados do carrossel.
Autoplay, fade, indicadores, swipe e movimento reduzido foram preservados.

Sem banner, o hero usa produtos reais do catálogo desta organização quando não
há destaques configurados. Não inventa promoção, desconto, anúncio ou vínculo.

### Associação explícita, pelo responsável da loja

1. Entrar no painel da organização desejada, conferir nome e endereço da loja.
2. Abrir `/app/banners`, clicar em adicionar e escolher uma das quatro artes
   do acervo. Conferir se a marca/produto da arte corresponde ao que a loja oferece.
3. Informar título e subtítulo próprios, sem inventar preços ou promoção.
4. Confirmar ativo e salvar. A ação existente usa a organização da sessão,
   valida permissão e caminho; não aceita atribuição a outra organização pelo navegador.
5. Ordenar os banners e conferir `/loja/<slug>` em desktop/celular.
6. Para desfazer a exibição, desativar o banner no próprio painel.

Essa operação altera configuração real: não foi executada como teste. Até que
o responsável salve um banner, o fallback é o comportamento correto.

## Fotografias

Inventário completo e pendências: [ACERVO-FOTOS-2026-10-19.md](ACERVO-FOTOS-2026-10-19.md).
43 nomes exatos no manifesto. Duas fotos adicionais publicadas; vínculos conhecidos
com embalagem divergente bloqueados. Skol lata350 permanece sem correspondência.
No banco: 356 produtos globais, 41 com arquivo local e 315 sem arquivo local.
Na loja consultada: 61 produtos, 11 resolvem fotografia local e 50 usam fallback.
Contagens não afirmam que cada item sem imagem tenha fotografia recuperável no acervo.
Nenhuma descrição, preço, estoque ou URL foi alterada no banco.
Diagnóstico repetível: em web, `node --env-file=.env --import tsx scripts/store-assets-check.ts <slug>`.
O script não imprime URLs externas que possam conter assinaturas privadas.

## Visual e entregador

Preservados hero dominante, navegação, título central e grid4/3/2, fotos contain,
preços/descontos reais. Altura de títulos ajustada para coerência entre cards.
Referência: site.html e etapa anterior ad8d5e9. Não se certifica igualdade pixel
a pixel: os prints não foram anexados novamente e a loja não possui banner salvo.

Entregador preservado: sessão/organização, atribuição, transições, navegação externa,
conclusão e tentativa sem sucesso. Ícones principais substituídos por SVG Lucide.
Testes executam a ação real de falha com dependências simuladas: retorna READY,
remove atribuição e não altera estoque/pagamento. Sem GPS automático.
Instalação PWA/offline não é certificada nesta etapa.

## Verificação e retomada

Validação consolidada: 80 testes aprovados, zero falhas; build e typecheck finais
aprovados, sem desativar verificações. Os quatro banners responderam HTTP200
na produção. Status do novo commit/deploy e revisão visual após publicação
são registrados na conversa, sem antecipar a confirmação.
Nenhum E2E real de compra, pagamento ou entrega foi realizado: o proprietário fará
essa validação seguindo [ROTEIRO-TESTE-PROPRIETARIO.md](ROTEIRO-TESTE-PROPRIETARIO.md).
O navegador exibiu a versão anterior e confirmou hero sem slides; ao atualizar,
o servidor local demorou na compilação e a conexão falhou. Revisão visual final
não deve ser declarada concluída sem nova evidência após publicação.

Publicar apenas código validado e fotos correspondentes; excluir .env, node_modules,
.next e Banneres public. Confirmar deploy pelo status do hash, não apenas pelo push.
