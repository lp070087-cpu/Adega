import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ acessoRemovido?: string; cadastrado?: string; next?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect(session.user.organizationId ? '/app/dashboard' : '/onboarding');
  }

  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-[460px] rounded-xl bg-white p-10 text-center shadow-xl">
        <span className="brand-mark mx-auto mb-4 h-[46px] w-[46px] text-[0.78rem]">DP</span>

        <h1 className="text-[1.35rem] font-extrabold text-ink-900">Delivery Platform</h1>
        <p className="mt-1.5 text-[0.84rem] text-ink-500">
          Entre para gerenciar pedidos, catálogo e entregas do seu estabelecimento.
        </p>

        {params.acessoRemovido && (
          <p className="mt-5 rounded border-2 border-warn/25 bg-warn-bg px-4 py-3 text-[0.78rem] text-warn">
            Seu acesso foi removido ou o estabelecimento não existe mais.
          </p>
        )}

        <LoginForm />

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
