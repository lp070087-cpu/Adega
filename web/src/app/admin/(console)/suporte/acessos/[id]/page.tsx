import {formatDateTime} from '@/lib/utils';
import {notFound} from 'next/navigation';
import {getSupportSnapshot} from '@/lib/platform/support-access';
import {AdminHeader,Panel,currency,date} from '@/components/admin/Display';
import {closeSupportAccess} from '../actions';
import {ORDER_STATUS_LABEL} from '@/data/business-copy';
export const dynamic='force-dynamic';
export default async function SupportSnapshot({params}:{params:Promise<{id:string}>}){
 const {id}=await params;let snapshot;try{snapshot=await getSupportSnapshot(id);}catch{notFound();}
 const {grant,organization,orders,drivers}=snapshot;
 return <><AdminHeader title={`Suporte · ${organization.name}`} description="Somente leitura · sua identidade administrativa permanece inalterada."/><Panel title={grant.driverId?'Painel de suporte do entregador':'Painel de suporte do estabelecimento'}><p>Expira em: {formatDateTime(grant.expiresAt)}. Motivo: {grant.reason}</p><p>{organization._count.orders} pedidos · {organization._count.products} produtos · {organization._count.drivers} entregadores.</p><p>Situação: {organization.status} · abertura: {organization.storeStatus}</p><form action={closeSupportAccess} className="platform-form"><input type="hidden" name="id" value={id}/><label className="platform-check"><input type="checkbox" name="confirm" required/>Encerrar e revogar este acesso</label><button>Encerrar suporte</button></form></Panel><Panel title="Entregadores">{drivers.map(driver=><p key={driver.id}>{driver.name} · {driver.active?'Ativo':'Inativo'} · {driver.status}</p>)}</Panel><Panel title="Últimos pedidos vinculados"><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Pedido</th><th>Data</th><th>Situação</th><th>Total</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td>#{order.displayId}</td><td>{date(order.createdAt)}</td><td>{ORDER_STATUS_LABEL[order.status]}</td><td>{currency(order.total)}</td></tr>)}</tbody></table></div>{!orders.length&&<p>Nenhum pedido encontrado.</p>}</Panel></>;
}
