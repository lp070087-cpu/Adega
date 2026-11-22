import { BeverageLibrary } from '@/components/catalog/BeverageLibrary';
import { requireOrgPage } from '@/lib/auth/guards';
import { getBeverageLibrary } from '@/lib/data/global-catalog';

export const metadata = { title: 'Biblioteca de bebidas' };
export const dynamic = 'force-dynamic';

export default async function BeverageLibraryPage() {
  const { organizationId } = await requireOrgPage('MANAGE_PRODUCTS');
  const products = await getBeverageLibrary(organizationId);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[1.05rem] font-extrabold text-ink-900">Biblioteca de bebidas</h2>
        <p className="mt-1 text-sm text-ink-500">Escolha os produtos da sua adega ou depósito. Depois, informe as quantidades e publique pelo Estoque.</p>
      </header>
      <BeverageLibrary products={products} />
    </div>
  );
}
