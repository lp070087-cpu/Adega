import { requirePlatformPage } from '@/lib/platform/auth';
import { canPlatformSection } from '@/lib/platform/rules';
import { AdminNavigation } from './AdminNavigation';
import '../platform.css';

const sections = [
  ['', 'Dashboard'],
  ['estabelecimentos', 'Estabelecimentos'],
  ['planos', 'Planos'],
  ['assinaturas', 'Assinaturas'],
  ['financeiro', 'Financeiro SaaS'],
  ['recebimentos', 'Recebimento dos planos'],
  ['integracoes', 'Integrações'],
  ['servicos', 'Serviços'],
  ['usuarios', 'Usuários'],
  ['suporte', 'Suporte'],
  ['configuracoes', 'Configurações'],
  ['auditoria', 'Auditoria'],
] as const;

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { role } = await requirePlatformPage();
  const items = sections.filter(([slug]) => slug === 'recebimentos' ? role === 'OWNER' : canPlatformSection(role, slug));

  return (
    <div className="platform-console">
      <AdminNavigation items={items} role={role} />
      <main className="platform-main">{children}</main>
    </div>
  );
}
