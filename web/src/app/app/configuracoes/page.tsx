import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationUsage } from '@/lib/data/organization';
import { Card, CardHeader } from '@/components/ui';
import { Store, Users, Package, MessageCircle } from 'lucide-react';
export default async function SettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const usage = await getOrganizationUsage(ctx.organizationId);
  return <div className="space-y-5"><h1 className="text-xl font-bold">Configurações</h1><p className="break-words text-sm text-ink-500">Conta autenticada: {ctx.user.email}. Perfil neste estabelecimento: {ctx.role}.</p><div className="grid gap-4 md:grid-cols-2">
    <Card><CardHeader title="WhatsApp" subtitle="Conexão comercial oficial e preferências do estabelecimento."/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/configuracoes/whatsapp"><MessageCircle size={18}/>Configurar WhatsApp</Link></Card>
    <Card><CardHeader title="Minha Loja" subtitle="Identidade, endereço, horários, entrega e disponibilidade."/><Link className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-3 font-semibold text-white" href="/app/configuracoes/minha-loja"><Store size={18}/>Configurar minha loja</Link></Card>
    <Card><CardHeader title="Equipe" subtitle={`${usage.users} pessoas com acesso à operação.`}/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/equipe"><Users size={18}/>Gerenciar acessos</Link></Card>
    <Card><CardHeader title="Estoque" subtitle="Padrões iniciais e ajustes com histórico."/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/estoque"><Package size={18}/>Configurar estoque</Link></Card>
    <Card><CardHeader title="Atendimento com IA" subtitle="Conexão oficial e serviços disponibilizados pela plataforma."/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/atendimento"><MessageCircle size={18}/>Consultar atendimento</Link></Card>
  </div><p className="text-sm text-ink-500">Serviços externos e credenciais são administrados pela plataforma. Sua loja acessa apenas as opções operacionais autorizadas.</p></div>;
}
