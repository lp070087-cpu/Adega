import { driverLogoutAction } from '@/app/actions/auth';

/**
 * Dono ou equipe abrindo o app do entregador no mesmo navegador do painel.
 * Painel e app usam a mesma sessão do navegador: sair aqui também encerra o
 * painel (era a causa do "Sessão expirada" nas ações de Entregadores). Por
 * isso o caminho principal é voltar ao painel; sair fica explícito.
 */
export function StaffSessionNotice() {
  return (
    <div className="mt-4 space-y-3 text-left text-sm text-ink-600">
      <p role="status">Este navegador está conectado ao <strong>painel da loja</strong>. O aplicativo do entregador usa a conta do próprio entregador.</p>
      <p>Para testar como entregador sem sair do painel, abra este link em uma <strong>janela anônima</strong>, em outro navegador ou no celular do entregador.</p>
      <div className="grid gap-2 pt-1">
        <a href="/app/entregadores" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white">Voltar ao painel</a>
        <form action={driverLogoutAction}>
          <button type="submit" className="min-h-11 w-full rounded-lg border border-ink-200 px-5 font-semibold text-ink-700">Sair do painel e entrar como entregador</button>
        </form>
        <p className="text-xs text-ink-500">Sair encerra a sua sessão do painel neste navegador.</p>
      </div>
    </div>
  );
}
