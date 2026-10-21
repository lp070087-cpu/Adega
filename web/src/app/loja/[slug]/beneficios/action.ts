'use server';
import { revalidatePath } from 'next/cache';
import { setGuestCampaignPreference } from '@/lib/data/guest-benefits';
export async function preferenceAction(_state:{message:string},form:FormData){
 try{const slug=String(form.get('slug')??''),orderId=String(form.get('orderId')??'');if(form.get('confirmed')!=='on')return {message:'Confirme a alteração de preferência.'};await setGuestCampaignPreference(slug,orderId,form.get('optOut')==='on',form.get('turboConsent')==='on');revalidatePath(`/loja/${encodeURIComponent(slug)}/beneficios`);return {message:'Preferência atualizada.'};}catch{return {message:'Não foi possível atualizar sua preferência.'};}
}
