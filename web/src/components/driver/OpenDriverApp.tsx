'use client';
import { useEffect } from 'react';

/** Abre o app pela rota que fixa a loja (navegação completa, para o cookie valer). */
export function OpenDriverApp({ href }: { href: string }) {
  useEffect(() => { window.location.replace(href); }, [href]);
  return <a href={href} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-5 font-semibold text-white">Abrir aplicativo</a>;
}
