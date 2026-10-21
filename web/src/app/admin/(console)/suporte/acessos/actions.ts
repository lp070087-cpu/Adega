'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {createSupportAccess,revokeSupportAccess} from '@/lib/platform/support-access';
export async function openSupportAccess(form:FormData){
 if(form.get('confirm')!=='on')throw new Error('Confirme o acesso de suporte.');
 const grant=await createSupportAccess(String(form.get('organizationId')??''),String(form.get('driverId')??'')||null,String(form.get('reason')??''));
 redirect(`/admin/suporte/acessos/${grant.id}`);
}
export async function closeSupportAccess(form:FormData){
 if(form.get('confirm')!=='on')throw new Error('Confirme o encerramento.');
 await revokeSupportAccess(String(form.get('id')??''));revalidatePath('/admin/suporte/acessos');redirect('/admin/suporte/acessos');
}
