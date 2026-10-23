import { driverLogoutAction } from '@/app/actions/auth';

/**
 * Sessão que não é de entregador (dono ou equipe) abrindo o app do
 * entregador. A área do entregador não oferece atalhos para outras áreas:
 * só explica que é preciso entrar com uma conta de entregador.
 *
 * Painel e app compartilham a sessão do navegador, então trocar de conta
 * aqui encerra a sessão atual — por isso o aviso é explícito.
 */
export function StaffSessionNotice() {
  return (
    <div className="mt-4 space-y-3 text-left text-sm text-ink-600">
      <p role="status">Este aplicativo é exclusivo para entregadores. A sessão aberta neste navegador não é de uma conta de entregador.</p>
      <p>Para usar o aplicativo, entre com o e-mail de entregador cadastrado pela loja. Em um aparelho compartilhado, prefira uma janela anônima.</p>
      <form action={driverLogoutAction} className="pt-1">
        <button type="submit" className="min-h-11 w-full rounded-lg bg-brand px-5 font-semibold text-white">Entrar com conta de entregador</button>
      </form>
      <p className="text-xs text-ink-500">Isso encerra a sessão atual deste navegador.</p>
    </div>
  );
}
