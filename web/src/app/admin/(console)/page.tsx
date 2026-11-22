import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getPlatformDashboard } from '@/lib/platform/data';
import { requirePlatformPage } from '@/lib/platform/auth';
import { effectiveContractStatus } from '@/lib/platform/rules';
import { AdminHeader, Metric, Panel, Empty, currency, date, Tag } from '@/components/admin/Display';
export default async function AdminDashboard(){
 const ctx=await requirePlatformPage(); if(ctx.role==='SUPPORT')redirect('/admin/estabelecimentos');
 const now=new Date();
 const own = await prisma.organizationUser.findFirst({ where: { userId: ctx.userId, role: 'OWNER', active: true, organization: { isDemo: false } }, select: { organization: { select: { slug: true } } }, orderBy: { createdAt: 'asc' } });
 const {organizations,active,suspended,contracts,received,pending,newOrganizations,recent,activeContracts,mrr,monthStart}=await getPlatformDashboard(now);
 return <><AdminHeader title="Visão geral" description="Operação e resultados comerciais da plataforma."/><Panel title="Acessos"><div className="flex flex-wrap gap-4">
   <Link href="/app">Painel da loja</Link><Link href="/app/assinatura">Assinar ou renovar plano</Link>
   {own && <Link href={`/loja/${own.organization.slug}/conta/entrar`}>Área do cliente da minha loja</Link>}
   <Link href="/entregador">Área do motoboy</Link>
 </div></Panel><div className="platform-metrics"><Metric label="Estabelecimentos" value={organizations} detail={`${active} ativos · ${suspended} suspensos`}/><Metric label="Assinaturas ativas" value={activeContracts.length} detail={`${contracts.filter(c=>effectiveContractStatus(c,now)==='TRIAL').length} em teste`}/><Metric label="Receita recorrente mensal" value={currency(mrr)} detail="Contratada · anual distribuído em 12 meses"/><Metric label="Recebido neste mês" value={currency(received._sum.amount)} detail="Somente cobranças com recebimento registrado"/><Metric label="Cobranças pendentes" value={currency(pending._sum.amount)} detail={`${pending._count} cobranças em aberto`}/><Metric label="Assinaturas vencidas" value={contracts.filter(c=>effectiveContractStatus(c,now)==='PAST_DUE').length}/><Metric label="Novos estabelecimentos" value={newOrganizations} detail="No mês atual"/><Metric label="Cancelamentos do mês" value={contracts.filter(c=>c.cancelledAt&&c.cancelledAt>=monthStart).length}/></div><Panel title="Cadastros recentes">{recent.length?<div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Estabelecimento</th><th>Situação</th><th>Cadastro</th><th>Loja</th></tr></thead><tbody>{recent.map(o=><tr key={o.id}><td>{o.name}<small>{o.businessType??'Segmento não informado'}</small></td><td><Tag>{o.status}</Tag></td><td>{date(o.createdAt)}</td><td><Link href={`/loja/${o.slug}`} target="_blank" rel="noopener noreferrer">Abrir loja</Link></td></tr>)}</tbody></table></div>:<Empty text="Os novos estabelecimentos aparecerão aqui."/>}</Panel></>;
}
