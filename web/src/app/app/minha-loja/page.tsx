import { headers } from 'next/headers';
import { requireOrgPage } from '@/lib/auth/guards';
import { can } from '@/lib/permissions';
import { getOrganizationById } from '@/lib/data/organization';
import { getStoreOperations } from '@/lib/data/store-ops';
import { StoreSettings } from '@/components/store/StoreSettings';
import type { StoreFormData } from '@/components/store/StoreSettings';

export const metadata = { title: 'Minha Loja' };
export const dynamic = 'force-dynamic';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MINHA LOJA
 * -----------------------------------------------------------------------
 * A organização vem da SESSÃO (requireOrgPage), nunca da URL. Não existe
 * rota do tipo /app/minha-loja?org=… de propósito: se existisse, bastaria
 * trocar o parâmetro para ler a loja de outra empresa.
 *
 * O endereço público é montado do host real da requisição, para não
 * mentir sobre onde a vitrine está publicada.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function MyStorePage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');

  const [organization, operations] = await Promise.all([
    getOrganizationById(ctx.organizationId),
    getStoreOperations(ctx.organizationId),
  ]);

  if (!organization) {
    return (
      <div className="rounded-lg border border-ink-100 bg-white p-6">
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Estabelecimento não encontrado</h2>
        <p className="mt-1 text-[0.82rem] text-ink-500">
          A sessão aponta para uma loja que não existe mais. Saia e entre novamente.
        </p>
      </div>
    );
  }

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? 'localhost:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const publicUrl = `${protocol}://${host}/loja/${organization.slug}`;

  const store: StoreFormData = {
    name: organization.name,
    slug: organization.slug,
    businessType: organization.businessType ?? '',
    brandColor: organization.brandColor,
    logoUrl: organization.logoUrl,
    description: organization.description,
    phone: organization.phone,
    whatsapp: organization.whatsapp,
    email: organization.email,
    address: organization.address,
    addressNumber: organization.addressNumber,
    addressComplement: organization.addressComplement,
    district: organization.district,
    city: organization.city,
    state: organization.state,
    zipCode: organization.zipCode,
    openingHours: organization.openingHours,
    minimumOrder: Number(organization.minimumOrder),
    deliveryRadius: Number(organization.deliveryRadius),
    baseDeliveryFee: Number(organization.baseDeliveryFee),
    extraKmFee: Number(organization.extraKmFee),
    averageDeliveryTime: organization.averageDeliveryTime,
    storeStatus: organization.storeStatus,
    // Vêm de settings (Json). `getStoreOperations` já reconfere o formato —
    // o que estiver gravado errado ali vira lista vazia, não tela quebrada.
    schedule: operations?.schedule ?? [],
    deliveryTiers: operations?.deliveryTiers ?? [],
    deliveryFeeMode: operations?.deliveryFeeMode ?? 'FIXED',
    deliveryZones: operations?.deliveryZones ?? [],
    allowPickup: operations?.allowPickup ?? true,
    allowOwnDelivery: operations?.allowOwnDelivery ?? true,
    allowMarketplace: operations?.allowMarketplace ?? false,
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Minha Loja</h2>
        <p className="text-[0.8rem] text-ink-500">
          Identidade, endereço, entrega e o endereço público da sua vitrine.
        </p>
      </div>

      <StoreSettings
        store={store}
        publicUrl={publicUrl}
        canManage={can(ctx.role, 'MANAGE_SETTINGS')}
        canChangeStatus={can(ctx.role, 'MANAGE_ORDERS')}
      />
    </div>
  );
}

