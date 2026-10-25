import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ownerResetValid } from '@/lib/auth/owner-reset';
import { OwnerResetForm } from './OwnerResetForm';

export const metadata = { title: 'Nova senha', referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function OwnerResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const valid = await ownerResetValid(token);
  return (
    <AuthShell audience="loja" title="Criar nova senha" subtitle="Escolha uma senha com pelo menos 8 caracteres." back={{ href: '/login', label: 'Voltar ao login' }}>
      {valid ? <OwnerResetForm token={token} /> : <><p role="alert" className="auth-alert is-error">Este link é inválido ou expirou.</p><p className="auth-hint" style={{ marginTop: 12 }}><Link href="/login/recuperar" className="auth-link">Pedir um novo link</Link></p></>}
    </AuthShell>
  );
}
