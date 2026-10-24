'use client';
import { useState } from 'react';
import { Copy, ExternalLink, Link2, MessageCircle, UserPlus } from 'lucide-react';

/**
 * Link único e permanente da área de entregadores. O mesmo link serve para
 * todos: a loja cadastra o e-mail do entregador e ele entra por aqui.
 */
export function DriverLinkCard({ url, onAdd }: { url: string | null; onAdd?: () => void }) {
  const [message, setMessage] = useState('');
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold';
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand"><Link2 size={20} aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="font-bold text-ink-900">Link dos entregadores</h3>
          <p className="text-sm text-ink-500">Cadastre o entregador com nome e e-mail: o sistema gera uma senha temporária de 4 dígitos. Envie este link; ele entra com o e-mail e a senha temporária e cria a própria senha.</p>
        </div>
      </div>
      {url ? (
        <>
          <p className="mt-3 break-all rounded-lg bg-ink-50 p-3 font-mono text-[0.82rem] text-ink-800" data-testid="driver-link">{url}</p>
          <div className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 lg:flex lg:flex-wrap">
            <button type="button" className={`${button} bg-brand text-white`} onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage('Link copiado.'); } catch { setMessage('Não foi possível copiar automaticamente. Selecione o endereço acima e copie.'); } }}><Copy size={16} aria-hidden />Copiar link</button>
            <a className={`${button} border border-ink-200 text-ink-800`} href={`https://wa.me/?text=${encodeURIComponent(`Acesse o aplicativo de entregas da nossa loja no Del Flash: ${url}\nEntre com o e-mail que cadastramos para você.`)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden />Compartilhar pelo WhatsApp</a>
            <a className={`${button} border border-ink-200 text-ink-800`} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden />Abrir aplicativo</a>
            {onAdd && <button type="button" className={`${button} border border-brand text-brand`} onClick={onAdd}><UserPlus size={16} aria-hidden />Adicionar entregador</button>}
          </div>
          {message && <p role="status" className="mt-2 text-sm text-ink-600">{message}</p>}
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Não foi possível montar o endereço público do link agora. Recarregue a página.</p>
      )}
    </section>
  );
}
