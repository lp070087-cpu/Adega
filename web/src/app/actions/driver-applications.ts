'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { auth,signIn,signOut } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { requirePermission,toActionError } from '@/lib/auth/guards';
import { driverRegistrationSchema,applicationStatuses,registrationPath } from '@/lib/driver-applications-rules';
import { createRegistrationLink,applyToStore,resolveRegistrationLink,requestDriverRegistration,confirmDriverRegistration,decideDriverApplication } from '@/lib/data/driver-applications';

export async function generateDriverLinkAction(){try{const ctx=await requirePermission('MANAGE_DRIVERS');await createRegistrationLink(ctx.organizationId);revalidatePath('/app/entregadores');return {ok:true};}catch(e){return toActionError(e);}}
export async function leaveDriverRegistrationAction(form:FormData){const number=form.get('storeNumber');let target='/entregador/';if(typeof number==='string'){try{const link=await resolveRegistrationLink(number);if(link)target=registrationPath(link);}catch{/* Sign-out still works if the store cannot be resolved. */}}await signOut({redirectTo:target});}
export async function registerDriverApplicationAction(input:unknown){
 const parsed=z.object({number:z.string(),data:driverRegistrationSchema}).safeParse(input);if(!parsed.success)return {error:parsed.error.errors[0]?.message??'Dados inválidos.'};
 let result:'session'|'verify';
 try{result=await requestDriverRegistration(parsed.data.number,parsed.data.data);}catch(e){return toActionError(e);}
 if(result==='verify')return {ok:true,verify:true};
 // Account created without a mail provider: sign in and land back on the store link, which shows the pending status.
 const link=await resolveRegistrationLink(parsed.data.number);
 await signIn('credentials',{login:parsed.data.data.email,password:parsed.data.data.password,driverOnly:'true',remember:'true',redirectTo:link?registrationPath(link):'/entregador/'});
 return {ok:true};
}
export async function confirmDriverApplicationAction(number:string,token:string){try{await confirmDriverRegistration(number,token);return {ok:true};}catch(e){return toActionError(e);}}
export async function joinDriverStoreAction(number:string){try{const session=await auth();if(!session?.user?.id)return {error:'Entre com sua conta individual de entregador.'};const link=await resolveRegistrationLink(number);if(!link)return {error:'Link indisponível.'};await applyToStore(link.organizationId,session.user.id);revalidatePath('/entregador');revalidatePath('/app/entregadores');return {ok:true};}catch(e){return toActionError(e);}}
export async function decideDriverApplicationAction(input:unknown){const parsed=z.object({id:z.string().cuid(),status:z.enum(applicationStatuses),reason:z.string().trim().min(5).max(300)}).safeParse(input);if(!parsed.success)return {error:'Informe uma decisão e justificativa válidas.'};try{const ctx=await requirePermission('MANAGE_DRIVERS');await decideDriverApplication(ctx.organizationId,parsed.data.id,parsed.data.status,ctx.user.id,parsed.data.reason);revalidatePath('/app/entregadores');revalidatePath('/entregador');return {ok:true};}catch(e){return toActionError(e);}}
export async function selectDriverStoreAction(form:FormData){
 const session=await auth(),id=form.get('organizationId');if(!session?.user?.id||session.user.role!=='DRIVER'||typeof id!=='string')return;
 const driver=await prisma.driver.findFirst({where:{organizationId:id,userId:session.user.id,active:true,user:{active:true,mustChangePassword:false,organizations:{some:{organizationId:id,role:'DRIVER',active:true}}}},select:{id:true}});
 if(!driver)return;
 (await cookies()).set('driver-store',id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});
 revalidatePath('/entregador');
}
