import { PrismaClient, type Prisma } from '@prisma/client';
import { pathToFileURL } from 'node:url';

const OWNER_EMAIL = 'lp070087@gmail.com';
export class StockPreviewError extends Error {}

/** Read-only report. This function contains no create/update/delete/execute SQL. */
export async function previewStockPublication(db: Prisma.TransactionClient, organizationId?:string) {
  const users = await db.user.findMany({ where:{email:{equals:OWNER_EMAIL,mode:'insensitive'}},select:{id:true,active:true,email:true} });
  if(users.length!==1 || !users[0].active || users[0].email?.toLowerCase()!==OWNER_EMAIL) throw new StockPreviewError('A conta indicada deve existir uma única vez e estar ativa.');
  const memberships = await db.organizationUser.findMany({ where:{userId:users[0].id,active:true,role:'OWNER',organization:{status:{not:'CANCELLED'}}},select:{organization:{select:{id:true,name:true,slug:true}}} });
  if(!memberships.length) throw new StockPreviewError('A conta não possui organização própria ativa para esta prévia.');
  if(!organizationId && memberships.length!==1) throw new StockPreviewError('Há mais de uma organização própria. Informe --organization-id com o ID conferido; nenhuma loja foi selecionada automaticamente.');
  const organization = organizationId ? memberships.find(member=>member.organization.id===organizationId)?.organization : memberships[0].organization;
  if(!organization) throw new StockPreviewError('A organização solicitada não pertence à conta indicada como proprietária ativa.');
  const products = await db.product.findMany({where:{organizationId:organization.id},select:{id:true,stock:true,minimumStock:true,active:true,available:true,trackStock:true,combo:{select:{id:true}}}});
  const ids=products.map(product=>product.id);
  const pending = ids.length ? await db.orderItem.findMany({where:{productId:{in:ids},order:{organizationId:organization.id,status:{notIn:['DELIVERED','CANCELLED']}}},select:{productId:true},distinct:['productId']}) : [];
  const reserved=new Set(pending.map(item=>item.productId));
  const pendingCombos=ids.length ? await db.combo.findMany({where:{organizationId:organization.id,items:{some:{productId:{in:ids}}},product:{orderItems:{some:{order:{organizationId:organization.id,status:{notIn:['DELIVERED','CANCELLED']}}}}}},select:{items:{select:{productId:true}}}}) : [];
  for(const combo of pendingCombos)for(const item of combo.items)reserved.add(item.productId);
  const eligible=products.filter(product=>!product.combo && !reserved.has(product.id));
  const distribution=(key:'stock'|'minimumStock')=>{
    const counts=new Map<number,number>();for(const product of eligible)counts.set(product[key],(counts.get(product[key])??0)+1);
    return [...counts.entries()].sort(([a],[b])=>a-b).map(([value,products])=>({value,products}));
  };
  return {
    mode:'READ_ONLY',observedAt:new Date().toISOString(),organization,
    products:products.length,eligible:eligible.length,
    excluded:{combos:products.filter(p=>Boolean(p.combo)).length,ongoingOrders:products.filter(p=>!p.combo&&reserved.has(p.id)).length},
    previous:{units:eligible.reduce((sum,p)=>sum+p.stock,0),stockDistribution:distribution('stock'),minimumDistribution:distribution('minimumStock')},
    proposed:{stockPerProduct:25,minimumPerProduct:5,totalUnits:eligible.length*25,toActivate:eligible.filter(p=>!p.active).length,toMakeAvailable:eligible.filter(p=>!p.available).length,toEnableStockControl:eligible.filter(p=>!p.trackStock).length},
    confirmationRequired:true,writeExecuted:false,
    note:'Prévia informativa, sem nomes de clientes ou dados pessoais. A aplicação exige nova prévia e confirmação explícita; pedidos/saldos podem mudar após esta consulta. Lotes de até 100 produtos.',
  };
}

async function main() {
  const args=process.argv.slice(2);
  if(args.length!==0 && !(args.length===2 && args[0]==='--organization-id' && /^[A-Za-z0-9_-]{1,100}$/.test(args[1]))) throw new StockPreviewError('Use apenas --organization-id ID, se necessário. Não existe opção de aplicação neste script.');
  const db=new PrismaClient();
  try { console.log(JSON.stringify(await db.$transaction(tx=>previewStockPublication(tx,args[1]),{isolationLevel:'RepeatableRead',timeout:15000}),null,2)); }
  finally { await db.$disconnect(); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{console.error(error instanceof StockPreviewError?error.message:'Não foi possível consultar a prévia. Nenhum segredo foi impresso ou saldo alterado.');process.exitCode=1;});
