# App do entregador simplificado — link único, cadastro, instalação — 22/10/2026

## Removido
- Fluxo separado de "Primeiro acesso" (botão no login, "Novo entregador" no painel que criava conta pendente de ativação, texto "use Primeiro acesso").
- Cards de convite e de link de instalação no painel; atalho "Instalação do entregador" em Configurações.
- Rotas antigas: `/entregador/instalar` → redireciona (307) para `/entregador/`; `/entregador/convite/<loja>` → redireciona para o link único da loja (ou `/entregador/`).
- Escolha manual de disponibilidade (Disponível/Retornando/Offline) no app e seletor de status no painel.
- Entregadores fora da lista de Equipe (continuam em Entregadores).

## Link único
- `/entregador/<slug-da-loja>/<número de 4 dígitos>` — um por loja, criado automaticamente na primeira visita a Entregadores.
- Sem login: abas Entrar / Criar conta (+ Esqueci minha senha). Conta de loja: orientação para usar conta individual.
- Logado sem vínculo: "Solicitar vínculo com esta loja" (sem criar outra conta). Pendente: "Solicitação enviada". Recusado/suspenso/revogado: mensagem e sem acesso.
- Aprovado: abre direto as entregas já na loja do link (troca de loja para quem trabalha em várias).

## Cadastro
- Nome, e-mail, senha e confirmação (mostrar/ocultar). Telefone/veículo opcionais depois.
- Com provedor de e-mail: confirmação por e-mail obrigatória (fluxo existente). Sem provedor: conta criada já com a solicitação PENDENTE; nada operacional até a loja aprovar; a loja vê "E-mail não confirmado".
- E-mail já existente nunca é tomado pelo link (conta ativa → "Entrar"; conta aguardando ativação → exige e-mail).

## Disponibilidade automática
- `src/lib/driver-availability.ts`: ativo + acesso pronto + dentro da escala + sem entrega em andamento. Usada na expedição, atribuição (servidor), Entrega Turbo, resumo do painel e app.

## Instalação (aba Conta)
- Card "Instalar Del Flash Entregador". Service worker e captura do aviso de instalação ficam num componente global da área do entregador.
- Android/Chrome: botão abre a instalação nativa; sem aviso disponível, mostra os passos do menu do navegador.
- iPhone: passos do Safari (Compartilhar → Adicionar à Tela de Início → Adicionar); em outro navegador do iPhone, orienta abrir no Safari.
- Instalado: "Aplicativo instalado", sem botão. Manifest com `orientation: any`.

## Testes
- `tsc`, `npm test` 250/250, `prisma validate`, `next build`.
- Navegador (banco com migrações): painel com link único + copiar/WhatsApp; conta da loja no link; cadastro (senhas diferentes recusadas; válido → pendente); pendente sem acesso; senha errada; aprovação com 1 toque; aprovado abre entregas; atribuição sem marcar disponibilidade; entrega completa com cliente atualizado; recusa; suspensão e reativação; entregador existente vincula 2ª loja e alterna entre as lojas pelos links; Android (prompt nativo), iPhone (passos), instalado; manifest/ícones/SW.
- Responsividade: 9 telas × 12 tamanhos (320–1440, retrato e paisagem) sem rolagem horizontal; alvos de toque ≥ 44 px corrigidos.
- Rede lenta (3G): toques repetidos geram uma única etapa; confirmação offline não é registrada nem mostra sucesso; retomada ao reconectar.
- Cópia do schema de produção (sem migrações): todas as páginas sem erro; fluxo completo de entrega com disponibilidade automática; painel mostra aviso de liberação pendente; link da loja indisponível até a migração.

## Migrações
- O novo fluxo usa as mesmas tabelas já ensaiadas; nenhuma migração nova ou alteração necessária.
- Para ativar em produção: aplicar `20261021210000_driver_applications` (e as do cliente) e definir `DRIVER_APPLICATIONS_ENABLED=true` na Vercel. `APP_PUBLIC_URL` deixa de ser obrigatório para exibir o link (usa o domínio da requisição).
