'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Aviso de "sem permissão". O guard do servidor manda para
 * `/app?semPermissao=1` quando o papel não pode abrir a tela pedida;
 * sem este aviso a pessoa voltava ao início sem saber por quê.
 */
export function PermissionNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (params.get('semPermissao') !== '1') return;
    setVisible(true);
    // Limpa a URL para o aviso não voltar ao recarregar.
    const next = new URLSearchParams(params.toString());
    next.delete('semPermissao');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  if (!visible) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[0.86rem] text-amber-900">
      <span>Seu perfil não tem permissão para abrir aquela tela. Peça ao responsável pela loja se precisar desse acesso.</span>
      <button type="button" onClick={() => setVisible(false)} className="shrink-0 font-semibold hover:underline">Fechar</button>
    </div>
  );
}
