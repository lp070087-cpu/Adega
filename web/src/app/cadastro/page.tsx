import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RegisterForm } from './RegisterForm';

export const metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect(session.user.organizationId ? '/app/dashboard' : '/onboarding');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-10 shadow-xl">
        <span className="brand-mark mb-4 flex h-[46px] w-[46px] items-center justify-center text-[0.78rem]">
          DP
        </span>

        <h1 className="text-[1.35rem] font-extrabold text-ink-900">Criar sua conta</h1>
        <p className="mt-1.5 text-[0.84rem] text-ink-500">
          Sua conta de acesso à plataforma. O estabelecimento é configurado no passo seguinte.
        </p>

        <RegisterForm />

        <p className="mt-6 text-center text-[0.8rem] text-ink-500">
          Já tem conta?{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
