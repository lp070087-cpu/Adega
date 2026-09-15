import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { countDefaultBanners, getStoreBanners } from '@/lib/data/store-ops';
import { BannerManager } from '@/components/store/BannerManager';

export const metadata = { title: 'Banners' };
export const dynamic = 'force-dynamic';

/**
 * Banners da vitrine.
 *
 * A lista vem filtrada por organização na própria consulta. O contador de
 * banners padrão é global de propósito — é só um número, para a tela poder
 * dizer o que a vitrine mostra enquanto o lojista não cadastra os dele.
 */
export default async function BannersPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');

  const [banners, defaultBannerCount] = await Promise.all([
    getStoreBanners(ctx.organizationId),
    countDefaultBanners(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Banners</h2>
        <p className="text-[0.8rem] text-ink-500">
          O que aparece no topo da sua loja pública, na ordem em que você definir.
        </p>
      </div>

      <BannerManager
        banners={banners}
        defaultBannerCount={defaultBannerCount}
        canManage={can(ctx.role, 'MANAGE_SETTINGS')}
      />
    </div>
  );
}
