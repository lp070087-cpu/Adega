import { DriverInstall } from '@/components/driver/DriverInstall';
import { DriverInstallShare } from '@/components/driver/DriverInstallShare';

export const metadata = { title: 'Instalar app do entregador' };
export default function InstallDriverPage() {
  return <main className="mx-auto min-h-screen max-w-xl space-y-5 p-5 py-10"><h1 className="text-2xl font-bold text-ink-900">Entregas na tela inicial</h1><p className="text-sm text-ink-600">Instale o atalho e acesse sua operação pelo celular.</p><DriverInstall /><DriverInstallShare /></main>;
}
