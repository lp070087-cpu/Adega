import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const dynamic = 'force-dynamic';

export default function AdminLogin() {
  if (process.env.PLATFORM_ADMIN_ENABLED !== 'true') notFound();
  return (
    <AuthShell audience="plataforma" title="Administração Del Flash" subtitle="Acesso exclusivo para operadores autorizados da plataforma." footer={<p><Link href="/login">Acessar como estabelecimento</Link></p>}>
      <LoginForm />
    </AuthShell>
  );
}
