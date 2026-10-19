import Link from 'next/link';
import { LayoutDashboard, Building2, Layers3, CreditCard, Wallet, Plug, Users, LifeBuoy, Settings, ScrollText, ArrowLeft } from 'lucide-react';
import { requirePlatformPage } from '@/lib/platform/auth';
import '../platform.css';
import { canPlatformSection } from '@/lib/platform/rules';
const items=[['','Dashboard',LayoutDashboard],['estabelecimentos','Estabelecimentos',Building2],['planos','Planos',Layers3],['assinaturas','Assinaturas',CreditCard],['financeiro','Financeiro SaaS',Wallet],['integracoes','Integrações',Plug],['usuarios','Usuários',Users],['suporte','Suporte',LifeBuoy],['configuracoes','Configurações',Settings],['auditoria','Auditoria',ScrollText]] as const;
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){
 const operator=await requirePlatformPage();
 return <div className="platform-console"><aside className="platform-sidebar"><Link href="/admin" className="platform-brand">ADEGA<span>PLATAFORMA</span></Link><div className="platform-context">Administração central</div><nav aria-label="Administração central">{items.filter(([slug])=>canPlatformSection(operator.role,slug)).map(([slug,label,Icon])=><Link key={slug} href={`/admin/${slug}`}><Icon size={18}/>{label}</Link>)}</nav><div className="platform-account"><span>Operador · {operator.role}</span><Link href="/app"><ArrowLeft size={15}/>Painel do estabelecimento</Link></div></aside><main className="platform-main">{children}</main></div>;
}
