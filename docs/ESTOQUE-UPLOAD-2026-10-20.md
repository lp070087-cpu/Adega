# Estoque e imagens — 20/10/2026

Sem alteração de schema ou escrita de teste no Neon.

## Estoque

Novos produtos controlados recebem por padrão 25 unidades e mínimo 5. Os valores podem ser configurados pelo responsável com permissão de configurações em Estoque → Configurar e inicializar. A configuração fica em `Organization.settings.inventoryDefaults` e preserva os demais parâmetros. Valores explicitamente informados, inclusive zero, são mantidos. Produtos novos não controlados não recebem saldo automático. Importações só criam itens ausentes, mantêm isolamento e registram o movimento inicial e o usuário responsável. Produtos próprios no onboarding também registram o movimento inicial; no onboarding v3 o saldo informado pelo usuário é preservado.

Produtos existentes não são modificados automaticamente. A inicialização exige seleção, motivo, prévia e confirmação. Somente itens controlados, saldo zero e sem movimentos são elegíveis. A confirmação relê essas condições dentro da transação com trava por organização; se uma venda ou ajuste tiver ocorrido, o lote é recusado integralmente. Reenvio após o primeiro lançamento encontra o histórico e não duplica estoque. Entradas, saídas e contagens permanecem no livro de movimentos com ator. A contagem absoluta agora permite definir zero; saídas continuam protegidas contra saldo negativo.

## Fotografias

O modal de produto permite selecionar arquivo, visualizar a imagem enviada, substituir e remover a foto personalizada. A gravação sincroniza a foto personalizada e o campo legado; remover reverte à foto global/local. O upload fica indisponível com comunicação explícita enquanto o serviço não estiver configurado.

Adaptador implementado: Cloudinary Upload API autenticada, assinatura SHA256 no servidor, identificador aleatório e pasta por organização. Configuração exclusivamente no servidor: `STORAGE_PROVIDER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Nenhuma credencial foi configurada ou enviada ao navegador nesta execução. Não há cobrança ou envio real de teste. Arquivos de produto aceitos: JPEG, PNG e WebP até 3 MB; bytes e MIME são conferidos no servidor. O adaptador permite até 5 MB para preservar a regra dos banners, cujo limite de transporte deve ser compatível na configuração Next.js. Arquivos antigos não são apagados quando substituídos.

Documentação oficial consultada: [Upload API](https://cloudinary.com/documentation/upload_images), [assinaturas](https://cloudinary.com/documentation/authentication_signatures). Não existe armazenamento em localStorage, base64 no banco ou escrita em disco efêmero da Vercel.

## Causas identificadas por inspeção

A importação antiga criava produtos com `trackStock=true`, saldo 0 e mínimo 0. O cadastro manual também enviava zero. A loja corretamente impedia comprar produtos controlados sem saldo. Outras condições existentes continuam válidas: loja pausada/fechada e horário de São Paulo, produto inativo ou indisponível, componentes de combo sem saldo, restrições comerciais quando explicitamente ativadas. Corrigir essas condições requer configuração ou contagem real, não desativar validações.

## Verificação posterior

Conferir estoque físico, abrir a inicialização, selecionar um produto zerado sem movimentos, revisar e confirmar. Conferir movimento e responsável. Repetir deve preservar o saldo. Testar entrada, saída e contagem zero. Após configurar storage central, enviar uma fotografia e salvar produto; verificar vitrine, substituir e remover, conferindo retorno à global. Os testes reais serão realizados pelo proprietário; os testes desta implementação usam mocks.
