'use client';
import { LogIn } from 'lucide-react';

/**
 * Sessão do painel encerrada (logout em outra aba, troca para o app do
 * entregador no mesmo navegador ou expiração real). Nada é executado sem
 * sessão; a pessoa entra de novo e volta para esta mesma tela.
 */
export function SessionExpiredNotice({ message, back, onBeforeLogin }: { message: string; back: string; onBeforeLogin?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-warn/30 bg-warn-bg px-4 py-3 text-[0.82rem] text-warn">
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-ink-600">Nada foi alterado. O que você digitou fica guardado neste aparelho e volta depois de entrar.</p>
      <a
        href={`/login?sessao=encerrada&voltar=${encodeURIComponent(back)}`}
        onClick={onBeforeLogin}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-sm bg-brand px-4 font-semibold text-white"
      >
        <LogIn size={16} aria-hidden /> Entrar novamente
      </a>
    </div>
  );
}
