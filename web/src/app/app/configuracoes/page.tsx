import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationUsage } from '@/lib/data/organization';
import { Card, CardHeader } from '@/components/ui';
import { Store, Users, Package, MessageCircle } from 'lucide-react';
import { InstallApp } from '@/components/pwa/InstallApp';
export default async function SettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const usage = await getOrganizationUsage(ctx.organizationId);
  return <div className="space-y-5"><h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Configurações</h2><p className="break-words text-sm text-ink-500">Conta autenticada: {ctx.user.email}. Perfil neste estabelecimento: {ctx.role}.</p><div className="grid gap-4 md:grid-cols-2">
    <Card><CardHeader title="WhatsApp" subtitle="Conexão comercial oficial e preferências do estabelecimento."/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/configuracoes/whatsapp"><MessageCircle size={18}/>Configurar WhatsApp</Link></Card>
    <Card><CardHeader title="Minha Loja" subtitle="Identidade, endereço, horários, entrega e disponibilidade."/><Link className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-3 font-semibold text-white" href="/app/configuracoes/minha-loja"><Store size={18}/>Configurar minha loja</Link></Card>
    <Card><CardHeader title="Equipe" subtitle={`${usage.users} pessoas com acesso à operação.`}/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/equipe"><Users size={18}/>Gerenciar acessos</Link></Card>
    <Card><CardHeader title="Estoque" subtitle="Padrões iniciais e ajustes com histórico."/><Link className="inline-flex items-center gap-2 font-semibold text-brand" href="/app/estoque"><Package size={18}/>Configurar estoque</Link></Card>
    <Card><CardHeader title="WhatsApp e IA" subtitle="Conexão oficial do número, assistente com IA e mensagens automáticas."/><div className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand" href="/app/configuracoes/whatsapp"><MessageCircle size={18}/>Configurar WhatsApp</Link><Link className="inline-flex min-h-11 items-center font-semibold text-brand" href="/app/atendimento">Abrir Atendimento</Link></div></Card>
    <Card><CardHeader title="Plano e assinatura" subtitle="Del Flash Completo · R$ 119,00 por mês."/><Link className="inline-flex min-h-11 items-center font-semibold text-brand" href="/app/assinatura">Consultar meu plano</Link></Card>
    <Card><CardHeader title="Instalar aplicativo" subtitle="Painel, loja e entregador mantêm acessos independentes."/><InstallApp name="Del Flash" worker="/pwa/panel-sw.js" scope="/app/" alwaysShow/><p className="text-sm text-ink-500">Entregadores instalam o app pela aba Conta do aplicativo do entregador.</p></Card>
  </div><p className="text-sm text-ink-500">Serviços externos e credenciais são administrados pela plataforma. Sua loja acessa apenas as opções operacionais autorizadas.</p></div>;
}
