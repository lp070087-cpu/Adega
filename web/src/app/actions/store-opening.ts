'use server';
import { revalidatePath } from 'next/cache';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { STORE_OPENING_MODE_LABEL, type StoreOpeningMode } from '@/lib/schedule';

export async function setStoreOpeningModeAction(mode: StoreOpeningMode) {
  try {
    const ctx = await requirePermission('MANAGE_ORDERS');
    if (!['AUTO','MANUAL_OPEN','MANUAL_CLOSED'].includes(mode)) return {ok:false as const,error:'Modo de abertura inválido.'};
    const slug = await withOrganizationTransaction(ctx.organizationId, async tx => {
      const org = await tx.organization.findUniqueOrThrow({where:{id:ctx.organizationId},select:{settings:true,slug:true}});
      const settings = org.settings && typeof org.settings==='object' && !Array.isArray(org.settings) ? org.settings : {};
      await tx.organization.update({where:{id:ctx.organizationId},data:{storeStatus:mode==='MANUAL_CLOSED'?'CLOSED':'OPEN',settings:{...settings,storeOpeningMode:mode}}});
      await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Abertura da loja alterada',message:`${STORE_OPENING_MODE_LABEL[mode]}. Responsável: ${ctx.user.id}. Horários cadastrados preservados.`,href:'/app/configuracoes/minha-loja'}});
      return org.slug;
    });
    revalidatePath('/app','layout'); revalidatePath(`/loja/${slug}`,'layout');
    return {ok:true as const,slug};
  } catch(error) {return {ok:false as const,error:toActionError(error).error};}
}
