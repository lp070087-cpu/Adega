import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getTeam } from '@/lib/data/team';
import { TeamManager } from '@/components/team/TeamManager';
import type { TeamRow, TeamSummary } from '@/components/team/TeamManager';

export const metadata = { title: 'Equipe' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EQUIPE
 * -----------------------------------------------------------------------
 * getTeam vive em src/lib/data/team, não em actions/team.ts. Um arquivo
 * 'use server' expõe cada export como rota POST pública; uma leitura que
 * recebe organizationId por parâmetro seria um endpoint para ler a equipe
 * de outra loja. Aqui o id vem da sessão (requireOrgPage).
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function TeamPage() {
  const ctx = await requireOrgPage('MANAGE_TEAM');
  const members = await getTeam(ctx.organizationId);

  const rows: TeamRow[] = members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.name,
    email: member.email,
    phone: member.phone,
    role: member.role,
    active: member.active,
    shift: member.shift ?? null,
    lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
    createdAt: member.createdAt.toISOString(),
  }));

  const byRoleMap = new Map<string, number>();
  for (const member of rows) {
    if (!member.active) continue;
    byRoleMap.set(member.role, (byRoleMap.get(member.role) ?? 0) + 1);
  }

  const summary: TeamSummary = {
    total: rows.length,
    active: rows.filter((m) => m.active).length,
    byRole: [...byRoleMap.entries()]
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count),
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Equipe</h2>
        <p className="text-[0.8rem] text-ink-500">
          Quem tem acesso a este estabelecimento e o que cada papel pode fazer.
        </p>
      </div>

      <TeamManager
        members={rows}
        summary={summary}
        canManage={can(ctx.role, 'MANAGE_TEAM')}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
