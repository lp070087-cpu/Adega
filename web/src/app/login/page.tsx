import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from './LoginForm';
import { BrandMark } from '@/components/ui/BrandMark';

export const metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ acessoRemovido?: string; cadastrado?: string; next?: string; voltar?: string; sessao?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  // `voltar` vem do aviso de sessão encerrada; `callbackUrl`, do middleware.
  let requested = params.voltar;
  if (!requested && params.callbackUrl) { try { requested = new URL(params.callbackUrl, 'http://local').pathname; } catch { requested = undefined; } }
  const back = requested && /^\/app(\/[a-z0-9\-/]*)?$/.test(requested) && !requested.includes('//') ? requested : undefined;
  // Sessão de entregador neste navegador não é sessão do painel: mostra o
  // formulário para entrar com a conta da loja em vez de mandar para o app.
  const driverSession = session?.user?.role === 'DRIVER';
  if (session?.user?.id && !driverSession) {
    redirect(back ?? (session.user.organizationId ? '/app/dashboard' : '/onboarding'));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-[460px] rounded-xl bg-white p-5 text-center shadow-xl sm:p-10">
        <div className="mb-4 flex justify-center"><BrandMark compact/></div>

        <h1 className="text-[1.35rem] font-extrabold text-ink-900">Del Flash</h1>
        <p className="mt-1.5 text-[0.84rem] text-ink-500">
          Entre para gerenciar pedidos, catálogo e entregas do seu estabelecimento.
        </p>

        {(params.sessao === 'encerrada' || driverSession) && (
          <p role="status" className="mt-5 rounded border-2 border-warn/25 bg-warn-bg px-4 py-3 text-[0.78rem] text-warn">
            {driverSession
              ? 'Este navegador está conectado ao aplicativo do entregador. Entre com a conta da loja para voltar ao painel.'
              : 'Sua sessão do painel foi encerrada neste navegador. Entre novamente para continuar de onde parou.'}
          </p>
        )}

        {params.acessoRemovido && (
          <p className="mt-5 rounded border-2 border-warn/25 bg-warn-bg px-4 py-3 text-[0.78rem] text-warn">
            Seu acesso foi removido ou o estabelecimento não existe mais.
          </p>
        )}

        <LoginForm back={back} />

        <p className="mt-6 text-[0.8rem] text-ink-500">
          Ainda não tem conta?{' '}
          <Link href="/cadastro" className="font-semibold text-brand hover:underline">
            Criar estabelecimento
          </Link>
        </p>
      </div>
    </main>
  );
}
