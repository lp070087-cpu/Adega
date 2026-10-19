import 'server-only';
import { prisma } from '@/lib/db';
import { requirePlatformRole } from './auth';
import { effectiveContractStatus, monthlyCents } from './rules';
export async function getPlatformDashboard(now=new Date()) {
 await requirePlatformRole(['OWNER','ADMIN','FINANCE']);
 const month=now.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}).slice(0,7);
 const monthStart=new Date(`${month}-01T00:00:00-03:00`);
 const [organizations,active,suspended,contracts,received,pending,newOrganizations,recent]=await Promise.all([
  prisma.organization.count(),prisma.organization.count({where:{OR:[{platformContract:{is:{status:'ACTIVE',dueAt:{gte:now}}}},{status:'ACTIVE',platformContract:{is:null}}]}}),prisma.organization.count({where:{OR:[{platformContract:{is:{status:'SUSPENDED'}}},{status:'SUSPENDED',platformContract:{is:null}}]}}),
  prisma.platformContract.findMany({select:{status:true,amount:true,period:true,dueAt:true,trialEndsAt:true,cancelledAt:true}}),
  prisma.saaSCharge.aggregate({where:{status:'PAID',paidAt:{gte:monthStart,lte:now}},_sum:{amount:true}}),
  prisma.saaSCharge.aggregate({where:{status:'PENDING'},_sum:{amount:true},_count:true}),
  prisma.organization.count({where:{createdAt:{gte:monthStart,lte:now}}}),
  prisma.organization.findMany({take:8,orderBy:{createdAt:'desc'},select:{id:true,name:true,slug:true,status:true,createdAt:true,businessType:true}})
 ]);
 const activeContracts=contracts.filter(c=>effectiveContractStatus(c,now)==='ACTIVE');
 const mrr=activeContracts.reduce((sum,c)=>sum+monthlyCents(c.amount,c.period),0)/100;
 return {organizations,active,suspended,contracts,received,pending,newOrganizations,recent,activeContracts,mrr,monthStart};
}
