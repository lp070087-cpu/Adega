import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from './LoginForm';
import { AuthShell } from '@/components/auth/AuthShell';

export const metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ acessoRemovido?: string; cadastrado?: string; next?: string; voltar?: string; sessao?: string; callbackUrl?: string; redefinida?: string }>;
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
  // Com `acessoRemovido` o JWT ainda é válido, mas o vínculo não existe
  // mais: redirecionar de volta ao painel fecharia um laço infinito
  // (painel → login → painel). Mostra o aviso e o formulário.
  if (session?.user?.id && !driverSession && !params.acessoRemovido) {
    redirect(back ?? (session.user.organizationId ? '/app/dashboard' : '/onboarding'));
  }

  return (
    <AuthShell
      audience="loja"
      title="Entrar no painel"
      subtitle="Gerencie pedidos, catálogo e entregas do seu estabelecimento."
      footer={<p>Ainda não tem conta? <Link href="/cadastro">Criar estabelecimento</Link></p>}
    >
      {(params.sessao === 'encerrada' || driverSession) && (
        <p role="status" className="auth-alert is-warn">
          {driverSession
            ? 'Este navegador está conectado ao aplicativo do entregador. Entre com a conta da loja para voltar ao painel.'
            : 'Sua sessão do painel foi encerrada neste navegador. Entre novamente para continuar de onde parou.'}
        </p>
      )}
      {params.acessoRemovido && <p className="auth-alert is-warn">Seu acesso foi removido ou o estabelecimento não existe mais.</p>}
      {params.redefinida && <p role="status" className="auth-alert is-ok">Senha redefinida. Entre com a nova senha.</p>}
      <LoginForm back={back} />
    </AuthShell>
  );
}
