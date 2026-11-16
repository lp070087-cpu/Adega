import { requireOrgPage } from '@/lib/auth/guards';
import { Card, CardHeader } from '@/components/ui';
import { ROLE_LABEL } from '@/data/business-copy';
import { ChangePasswordForm } from './ChangePasswordForm';

export const metadata = { title: 'Minha conta' };

/**
 * Conta pessoal de quem está logado. Não exige permissão: qualquer papel
 * da equipe (gerente, atendente, cozinha…) troca a própria senha aqui.
 * Antes o "Minha conta" do menu levava a Configurações, que só o dono e o
 * administrador abrem.
 */
export default async function AccountPage() {
  const { user, role } = await requireOrgPage();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader title="Minha conta" subtitle="Seus dados de acesso ao painel." />
        <dl className="grid gap-2 text-[0.86rem]">
          <div><dt className="text-ink-500">Nome</dt><dd className="font-semibold text-ink-800">{user.name || '—'}</dd></div>
          <div><dt className="text-ink-500">E-mail</dt><dd className="font-semibold text-ink-800">{user.email || '—'}</dd></div>
          <div><dt className="text-ink-500">Perfil</dt><dd className="font-semibold text-ink-800">{ROLE_LABEL[role] ?? role}</dd></div>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Trocar senha" />
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
