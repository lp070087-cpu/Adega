import Link from 'next/link';

export const metadata = { title: 'Página não encontrada' };

/**
 * 404 do app.
 *
 * O caso mais comum aqui é um slug de loja que não existe — link antigo,
 * loja cancelada ou endereço digitado errado. A tela não tenta adivinhar
 * qual seria a loja certa: diz o que aconteceu e oferece as saídas reais.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-16">
      <div className="w-full max-w-[440px] text-center">
        <span className="brand-mark mx-auto h-12 w-12 text-[0.9rem]">404</span>

        <h1 className="mt-5 text-[1.3rem] font-extrabold text-ink-900">
          Não encontramos esta página
        </h1>

        <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-500">
          O endereço pode estar errado, ou o estabelecimento pode ter saído do ar. Se você chegou
          por um link de loja, vale conferir o endereço com quem enviou.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/"
            className="rounded-sm bg-brand px-5 py-2.5 text-[0.86rem] font-semibold text-white transition-all hover:bg-brand-dark"
          >
            Ir para o início
          </Link>
          <Link
            href="/login"
            className="rounded-sm border-2 border-ink-200 bg-white px-5 py-2.5 text-[0.86rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
          >
            Entrar no painel
          </Link>
        </div>
      </div>
    </main>
  );
}
