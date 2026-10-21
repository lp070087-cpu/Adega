# Mobile e banners — 20/10/2026

## Alterações

Cards da loja sem borda, grade compacta de duas colunas no celular, foto inteira, descrição limitada e preços/ações com quebra adequada. Cada categoria mantém os primeiros 12 produtos; as demais linhas são expandidas/recolhidas dentro da própria seção. A animação horizontal é contida no componente e respeita movimento reduzido. Imagens continuam lazy; produtos não são duplicados na expansão.

StoreBanner reutiliza a coluna textual placement: `hero`, `hero-mobile` e `transition:CATEGORY_ID`. Administração lista todas as posições, permite imagem, título, subtítulo, link opcional, ordem e ativação. Categoria é verificada no servidor contra a organização da sessão. Consulta pública mobile exige organização e ativo; não há fallback para banners de outras lojas. Não exige migração.

Hero usa carrossel mobile próprio quando cadastrado; sem ele mantém imagem desktop proporcional. Texto, botões e respiro mobile foram compactados. Transições aparecem antes da categoria associada, conforme categorias reais da loja.

Três modelos editáveis locais em public/catalog/banners: mobile-cervejas.svg, mobile-whisky.svg e mobile-refrigerantes.svg. Incorporam os bytes das fotografias reais Heineken 350ml, Red Label 1L e Guaraná Antarctica 2L; não criam embalagem, preço ou promoção. O script generate-mobile-banner-templates.mjs permite editar a composição. Apenas esses SVG locais revisados são aceitos como acervo; upload de SVG continua proibido. Não foram associados a organizações.

Formulários e modais recebem largura mínima correta; inputs mobile têm 44px e fonte 16px; textos longos podem quebrar; métricas e filtros centrais adaptam largura. Não foi adicionado overflow-x hidden ao body.

## WhatsApp

Rota `/app/configuracoes/whatsapp`, com permissão MANAGE_SETTINGS e estado vindo exclusivamente do canal da própria organização. Nenhum token é serializado. Conexão por Embedded Signup está indisponível enquanto não houver aplicativo/permissões oficiais e implementação homologada desse onboarding. O backend de canal, verificação e webhook da etapa anterior permanece preparado; não há alegação de OAuth completo ou conexão real.

Referência oficial consultada: https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup . A página de implementação da Meta recusou a consulta com HTTP429; parâmetros atuais do onboarding devem ser revalidados quando a aplicação Meta estiver habilitada. Não foi copiado fluxo não oficial ou QR de WhatsApp Web.

## Verificação

126 testes isolados aprovados; TypeScript aprovado. Build aprovado. A loja vinculada à conta proprietária existente e ativa usa `/loja/loja-0102`, conforme consulta somente de leitura; o slug anterior retornou 404. A consulta não concedeu privilégio central nem alterou dados.

Navegador local recusou conexão mesmo com servidor pronto. A loja publicada está acessível; revisão posterior ao deploy deve registrar separadamente as larguras 320,360,375,390,414,768,1024 e desktop. Telas autenticadas não podem ser consideradas visualmente aprovadas sem sessão autorizada. Não declarar responsividade total ou E2E apenas pelos testes com mocks.
