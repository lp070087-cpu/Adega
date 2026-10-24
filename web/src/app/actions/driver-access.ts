'use server';
import {z} from 'zod';
import {AuthError} from 'next-auth';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {auth,signIn} from '@/lib/auth';
import {prisma} from '@/lib/db';
import {passwordSchema} from '@/lib/validations/common';
import {requestDriverCode,confirmDriverCode,driverMailReady} from '@/lib/auth/driver-access';
import {DRIVER_STORE_COOKIE,preferDriverStore} from '@/lib/data/driver-link';
import {OperationError} from '@/lib/operation-error';

export type DriverAccessState={ok:boolean;message:string;step?:'email'|'code'};
const store=z.string().max(160).regex(/^[a-z0-9-]*$/).optional().catch(undefined);
const email=z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(254);

/** Mesma resposta exista ou não a conta: o e-mail não é revelado. */
export async function requestDriverCodeAction(_state:DriverAccessState,form:FormData):Promise<DriverAccessState>{
 const input=email.safeParse(form.get('email'));
 if(!input.success)return {ok:false,message:'Informe um e-mail válido.',step:'email'};
 if(!driverMailReady())return {ok:false,message:'O envio de código por e-mail ainda não foi ativado pela plataforma.',step:'email'};
 try{await requestDriverCode(input.data);}catch(error){
  if(error instanceof OperationError&&/enviar/.test(error.message))return {ok:false,message:error.message,step:'email'};
 }
 return {ok:true,step:'code',message:'Se este e-mail estiver cadastrado por uma loja, enviamos um código de 6 dígitos. Confira a caixa de entrada e o spam. O código vale 10 minutos.'};
}

export async function confirmDriverCodeAction(_state:DriverAccessState,form:FormData):Promise<DriverAccessState>{
 const input=z.object({email,code:z.string().trim().regex(/^\d{6}$/,'Digite os 6 números do código.'),password:passwordSchema.refine(value=>Buffer.byteLength(value,'utf8')<=72,'Use uma senha de até 72 bytes.'),confirm:z.string(),store}).refine(v=>v.password===v.confirm,{message:'As senhas precisam ser iguais.'}).safeParse(Object.fromEntries(['email','code','password','confirm','store'].map(key=>[key,form.get(key)??undefined])));
 if(!input.success)return {ok:false,step:'code',message:input.error.issues[0]?.message??'Confira os dados.'};
 let account:string;
 try{account=await confirmDriverCode(input.data.email,input.data.code,input.data.password);}
 catch(error){return {ok:false,step:'code',message:error instanceof OperationError?error.message:'Não foi possível confirmar o código. Peça um novo.'};}
 if(input.data.store)await preferDriverStore(input.data.store);
 try{await signIn('credentials',{login:account,password:input.data.password,driverOnly:'true',store:input.data.store??'',remember:form.get('remember')==='on'?'true':'false',redirectTo:'/entregador/'});}
 catch(error){if(error instanceof AuthError)return {ok:true,step:'email',message:'Senha definida. Entre com seu e-mail e a nova senha.'};throw error;}
 return {ok:true,message:'Senha definida.'};
}

/** Troca a loja de trabalho de um entregador que atende mais de uma loja. */
export async function selectDriverStoreAction(form:FormData){
 const userId=(await auth())?.user?.id;
 if(!userId)redirect('/entregador/');
 const organizationId=String(form.get('organizationId')??'');
 const allowed=await prisma.organizationUser.findFirst({where:{userId,organizationId,role:'DRIVER',active:true,organization:{drivers:{some:{userId,active:true}}}},select:{id:true}});
 if(allowed)(await cookies()).set(DRIVER_STORE_COOKIE,organizationId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365});
 redirect('/entregador/');
}

/** Primeiro acesso com a credencial temporária: cria a senha definitiva e entra. */
export async function activateDriverAction(_state:DriverAccessState,form:FormData):Promise<DriverAccessState>{
 const input=z.object({email,pin:z.string().regex(/^\d{4}$/),password:passwordSchema.refine(value=>Buffer.byteLength(value,'utf8')<=72,'Use uma senha de até 72 bytes.'),confirm:z.string(),store}).refine(v=>v.password===v.confirm,{message:'As senhas precisam ser iguais.'}).safeParse(Object.fromEntries(['email','pin','password','confirm','store'].map(key=>[key,form.get(key)??undefined])));
 if(!input.success)return {ok:false,message:input.error.issues[0]?.message??'Confira os dados.'};
 const {useTemporaryCredential}=await import('@/lib/auth/driver-temp');
 let account:string;
 try{account=(await useTemporaryCredential(input.data.email,input.data.pin,input.data.password)).email;}
 catch(error){return {ok:false,message:error instanceof OperationError?error.message:'Não foi possível ativar o acesso. Tente de novo.'};}
 if(input.data.store)await preferDriverStore(input.data.store);
 try{await signIn('credentials',{login:account,password:input.data.password,driverOnly:'true',store:input.data.store??'',remember:form.get('remember')==='on'?'true':'false',redirectTo:'/entregador/'});}
 catch(error){if(error instanceof AuthError)return {ok:true,message:'Senha criada. Entre com seu e-mail e a nova senha.'};throw error;}
 return {ok:true,message:'Senha criada.'};
}
