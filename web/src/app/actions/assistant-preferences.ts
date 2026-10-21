'use server';
import { requirePermission, toActionError } from '@/lib/auth/guards';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { assistantPreferencesSchema } from '@/lib/assistant/preferences';
import { revalidatePath } from 'next/cache';
export async function saveAssistantPreferences(form: FormData) {
  try {
    const ctx = await requirePermission('MANAGE_SETTINGS');
    const preferences = assistantPreferencesSchema.parse({businessPhone:form.get('businessPhone'), hoursEnabled:form.get('hoursEnabled') === 'on', days:form.getAll('days').map(Number), opens:form.get('opens'), closes:form.get('closes'), awayMessage:form.get('awayMessage')});
    await withOrganizationTransaction(ctx.organizationId, async tx => {
      const organization = await tx.organization.findUnique({where:{id:ctx.organizationId},select:{settings:true}});
      const settings = (organization?.settings ?? {}) as Record<string,any>;
      await tx.organization.update({where:{id:ctx.organizationId},data:{settings:{...settings,assistant:{...settings.assistant,preferences}}}});
      await tx.notification.create({data:{organizationId:ctx.organizationId,userId:ctx.user.id,type:'SYSTEM',title:'Preferências do atendimento atualizadas',message:'Número solicitado e horários salvos; isso não conecta o WhatsApp nem ativa a IA.',href:'/app/atendimento'}});
    });
    revalidatePath('/app/atendimento'); revalidatePath('/app/configuracoes/whatsapp');
    return {ok:true};
  } catch(error) { return {ok:false,...toActionError(error)}; }
}
