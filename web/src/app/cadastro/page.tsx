import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { RegisterForm } from './RegisterForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect(session.user.organizationId ? '/app/dashboard' : '/onboarding');
  }

  return (
    <AuthShell audience="loja" title="Criar sua conta" subtitle="Sua conta de acesso à plataforma. O estabelecimento é configurado no passo seguinte." footer={<p>Já tem conta? <Link href="/login">Entrar</Link></p>}>
      <RegisterForm />
    </AuthShell>
  );
}
