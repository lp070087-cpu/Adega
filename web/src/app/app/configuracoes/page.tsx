import Link from 'next/link';
import { prisma } from '@/lib/db';
import { driverStorePath } from '@/lib/data/driver-link';
import { canOpenOwnerCustomerAccount } from '@/lib/customer-portal/server';
import { requireOrgPage } from '@/lib/auth/guards';
import { Card, CardHeader } from '@/components/ui';
import { ROLE_LABEL } from '@/data/business-copy';
import { InstallApp } from '@/components/pwa/InstallApp';

export default async function SettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const [store, owner] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { slug: true } }),
    canOpenOwnerCustomerAccount(ctx.organizationId),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Visão geral</h2>
        <p className="mt-1 break-words text-sm text-ink-500">
          {ctx.user.email} · {ROLE_LABEL[ctx.role] ?? ctx.role}
        </p>
      </div>
      <Card>
        <CardHeader title="Instalar aplicativo" subtitle="Painel, loja e entregador têm acessos independentes." />
        <InstallApp name="Del Flash" worker="/pwa/panel-sw.js" scope="/app/" alwaysShow />
        {store && <div className="my-3 flex flex-wrap gap-3">
          <Link className="font-semibold text-brand underline" href={owner ? "/entregador/" : driverStorePath(store.slug)}>Abrir painel do entregador</Link>
          {owner && <Link className="font-semibold text-brand underline" href={`/loja/${store.slug}/conta/entrar`}>Abrir área do cliente com minha conta Del Flash</Link>}
        </div>}
        <p className="text-sm text-ink-500">Entregadores instalam o app em Ajustes, no aplicativo do entregador.</p>
      </Card>
    </div>
  );
}
