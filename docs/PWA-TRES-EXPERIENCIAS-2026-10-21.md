# Instalação das três experiências

## Implementado

- **Estabelecimento:** manifesto `/pwa/panel.webmanifest`, identidade `/app`, início `/app/dashboard`, nome Adega Gestão e ícones PNG próprios em 192 e 512 px. O botão de instalação fica ao final do conteúdo do painel autenticado.
- **Entregador:** preservado `/manifest.webmanifest`, início e identidade `/entregador`, com os ícones e fluxo de instalação anteriores. A identidade explícita corresponde ao início já publicado, preservando a instalação existente.
- **Cliente:** manifesto dinâmico `/loja/[slug]/manifest.webmanifest`, nome e cor da organização consultada, início e identidade próprios do slug. O botão de instalação é apresentado no fim das páginas da loja, inclusive acompanhamento e benefícios.
- O layout geral deixou de anunciar o manifesto do entregador em todas as páginas. Admin central, cadastro e páginas comerciais não oferecem indevidamente esse aplicativo.
- Os botões usam o evento de instalação quando oferecido pelo navegador e apresentam instruções específicas para Android, Safari no iPhone/iPad e Chrome/Edge no desktop. Não anunciam APK, publicação em lojas ou envio de notificações push.

## Segurança e atualização

Cada worker tem escopo limitado à experiência correspondente. O worker do painel é servido fora do middleware de autenticação, mas só intercepta navegações em `/app` e descendentes. O manifesto não concede autorização: o servidor continua verificando sessão, papel e vínculo em cada acesso.

Os workers de painel e cliente são somente de rede: não usam Cache Storage, IndexedDB, filas de escrita ou sincronização de operações. Em ausência de conexão mostram uma página explícita sem dados pessoais. Requisições de API, operações POST e URLs de outras organizações não são interceptadas.

Os escopos terminam em barra: `/app/`, `/entregador/` e `/loja/[slug]/`. Isso impede que o navegador considere `/loja/adega-central/` parte do aplicativo instalado para `/loja/adega/`. Os inícios da loja e do entregador também terminam em barra. O middleware redireciona os endereços antigos desses dois inícios com código 308, preservando parâmetros; as outras rotas mantêm a forma canônica anterior sem barra final. O Auth.js continua sendo invocado somente para `/app` e `/onboarding`, e os guardas do servidor permanecem intactos.

O registro verifica atualizações ao abrir a experiência. Não força recarregamento nem descarta formulários. É necessário HTTPS em produção; localhost é permitido pelos navegadores para desenvolvimento.

## Validação realizada

Testes automatizados direcionados cobrem identidades independentes; validação de slug/cor; isolamento real dos escopos com prefixos semelhantes; normalização dos endereços antigos; delegação das rotas protegidas ao Auth.js; isolamento dos workers; ausência de cache e de reenvio de operações; resposta sem conexão; dimensões reais dos arquivos PNG e presença das instruções por plataforma.

Os testes utilizam execução isolada do código do worker e arquivos reais. Não representam instalação física em Android/iPhone/desktop. A instalação em dispositivos e a persistência após reiniciar o aplicativo ainda exigem teste manual. TypeScript e build serão registrados no relatório consolidado.

## Roteiro manual

1. Em HTTPS, entrar no painel com uma conta autorizada e usar **Instalar aplicativo**. Verificar nome Adega Gestão, ícone, abertura sem barra de endereço e retorno ao login quando a sessão expirar.
2. Abrir `/entregador/instalar` e instalar o aplicativo do entregador. Entrar com as credenciais individuais sem modificar a instalação do painel.
3. Abrir uma loja real e usar o botão ao fim da página. Instalar e conferir nome da organização, catálogo, carrinho e acompanhamento dentro da experiência do cliente.
4. Instalar outra loja e conferir que a identidade difere da primeira. Não efetuar pedidos reais sem autorização.
5. No iPhone, usar Safari e Compartilhar → Adicionar à Tela de Início. No Android e desktop, usar a opção disponibilizada pelo navegador.
6. Desconectar a rede e navegar: deve aparecer **Você está sem conexão**, sem pedidos armazenados ou operações enviadas. Reconectar e tentar novamente.
7. Atualizar o aplicativo e confirmar que dados privados de outro perfil ou estabelecimento não aparecem.

Fontes técnicas oficiais consultadas: [manifestos](https://web.dev/learn/pwa/web-app-manifest), [escopo de service worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register) e [cabeçalho Service-Worker-Allowed](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed).
