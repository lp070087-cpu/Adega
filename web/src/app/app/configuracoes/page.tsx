import Link from 'next/link';
import { requireOrgPage } from '@/lib/auth/guards';
import { getOrganizationUsage } from '@/lib/data/organization';
import { Card, CardHeader } from '@/components/ui';
import { Store, Users, Package, MessageCircle, CreditCard, Receipt, Truck } from 'lucide-react';
import { ROLE_LABEL } from '@/data/business-copy';
import { InstallApp } from '@/components/pwa/InstallApp';
export default async function SettingsPage() {
  const ctx = await requireOrgPage('MANAGE_SETTINGS');
  const usage = await getOrganizationUsage(ctx.organizationId);
  const groups: Array<{ title: string; items: Array<{ title: string; subtitle: string; href: string; cta: string; icon: React.ReactNode }> }> = [
    { title: 'Loja', items: [
      { title: 'Minha loja', subtitle: 'Identidade, endereço, horários e disponibilidade.', href: '/app/configuracoes/minha-loja', cta: 'Configurar minha loja', icon: <Store size={18} /> },
      { title: 'Entregas e frete', subtitle: 'Faixas de distância, raio, bairros e localização da loja no mapa.', href: '/app/configuracoes/minha-loja?aba=entrega', cta: 'Configurar entregas', icon: <Truck size={18} /> },
      { title: 'Equipe', subtitle: `${usage.users} ${usage.users === 1 ? 'pessoa' : 'pessoas'} com acesso ao painel.`, href: '/app/equipe', cta: 'Gerenciar acessos', icon: <Users size={18} /> },
      { title: 'Plano e assinatura', subtitle: 'Del Flash Completo · R$ 119,00 por mês.', href: '/app/assinatura', cta: 'Consultar meu plano', icon: <CreditCard size={18} /> },
    ] },
    { title: 'Vendas e atendimento', items: [
      { title: 'WhatsApp e IA', subtitle: 'Conexão oficial do número, assistente com IA e mensagens automáticas.', href: '/app/configuracoes/whatsapp', cta: 'Configurar WhatsApp', icon: <MessageCircle size={18} /> },
      { title: 'Pagamentos', subtitle: 'Formas aceitas, situação do pagamento e pagamento online (Pix e cartão).', href: '/app/configuracoes/pagamentos', cta: 'Configurar pagamentos', icon: <CreditCard size={18} /> },
      { title: 'Documentos fiscais', subtitle: 'Cadastro tributário e emissão de NFC-e/NF-e por provedor homologado.', href: '/app/configuracoes/fiscal', cta: 'Abrir fiscal', icon: <Receipt size={18} /> },
    ] },
    { title: 'Operação', items: [
      { title: 'Estoque', subtitle: 'Padrões iniciais e ajustes com histórico.', href: '/app/estoque', cta: 'Configurar estoque', icon: <Package size={18} /> },
    ] },
  ];
  return <div className="space-y-6"><div><h2 className="text-[1.35rem] font-extrabold tracking-tight text-ink-900">Configurações</h2><p className="mt-1 break-words text-sm text-ink-500">{ctx.user.email} · {ROLE_LABEL[ctx.role] ?? ctx.role}</p></div>
    {groups.map((group) => <section key={group.title} className="space-y-2.5"><h3 className="text-[0.74rem] font-bold uppercase tracking-wider text-ink-400">{group.title}</h3><div className="grid gap-3 md:grid-cols-2">
      {group.items.map((item) => <Link key={item.href} href={item.href} className="group flex items-start gap-3 rounded-2xl border border-ink-100 bg-white p-4 transition-shadow hover:shadow-md"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">{item.icon}</span><span className="min-w-0"><span className="block font-semibold text-ink-900">{item.title}</span><span className="block text-[0.8rem] text-ink-500">{item.subtitle}</span><span className="mt-1.5 inline-block text-[0.8rem] font-semibold text-brand group-hover:underline">{item.cta} →</span></span></Link>)}
    </div></section>)}
    <section className="space-y-2.5"><h3 className="text-[0.74rem] font-bold uppercase tracking-wider text-ink-400">Aplicativo</h3><Card><CardHeader title="Instalar aplicativo" subtitle="Painel, loja e entregador têm acessos independentes."/><InstallApp name="Del Flash" worker="/pwa/panel-sw.js" scope="/app/" alwaysShow/><p className="text-sm text-ink-500">Entregadores instalam o app pela aba Ajustes do aplicativo do entregador.</p></Card></section>
    <p className="text-sm text-ink-500">Serviços externos e credenciais são administrados pela plataforma Del Flash.</p></div>;
}
