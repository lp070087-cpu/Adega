import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ownerResetReady } from '@/lib/auth/owner-reset';
import { OwnerResetRequestForm } from './OwnerResetRequestForm';

export const metadata = { title: 'Recuperar senha' };
export const dynamic = 'force-dynamic';

export default function OwnerRecoverPage() {
  const ready = ownerResetReady();
  return (
    <AuthShell audience="loja" title="Recuperar senha" subtitle="Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha." back={{ href: '/login', label: 'Voltar ao login' }} footer={<p>Lembrou a senha? <Link href="/login">Entrar</Link></p>}>
      {ready ? <OwnerResetRequestForm /> : <p role="status" className="auth-alert is-warn">A recuperação por e-mail ainda não está ativa nesta plataforma (provedor de e-mail não configurado). Peça ao responsável pela loja ou ao suporte Del Flash para redefinir seu acesso.</p>}
    </AuthShell>
  );
}
