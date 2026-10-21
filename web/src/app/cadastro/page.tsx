import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RegisterForm } from './RegisterForm';
import { BrandMark } from '@/components/ui/BrandMark';

export const metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect(session.user.organizationId ? '/app/dashboard' : '/onboarding');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-4">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-5 shadow-xl sm:p-10">
        <div className="mb-4"><BrandMark/></div>

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
