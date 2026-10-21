'use server';
import {z} from 'zod';
import {AuthError} from 'next-auth';
import {signIn} from '@/lib/auth';
import {passwordSchema} from '@/lib/validations/common';
import {requestDriverAccess,consumeDriverAccess,driverMailReady} from '@/lib/auth/driver-access';
import {OperationError} from '@/lib/operation-error';
export type DriverAccessState={ok:boolean;message:string};
const modeSchema=z.enum(['activate','reset']);
const generic='Se houver um cadastro de entregador ativo para este e-mail, você receberá um link. Confira a caixa de entrada e o spam. Aguarde 30 minutos antes de solicitar novamente.';
export async function requestDriverAccessAction(_state:DriverAccessState,form:FormData):Promise<DriverAccessState>{
 const input=z.object({email:z.string().trim().email().max(254),mode:modeSchema}).safeParse({email:form.get('email'),mode:form.get('mode')});
 if(!input.success)return {ok:false,message:'Informe um e-mail válido.'};
 if(!driverMailReady())return {ok:false,message:'Envio de e-mail aguardando configuração pela plataforma.'};
 try{await requestDriverAccess(input.data.email,input.data.mode);}catch{/* Não revelar existência de conta ou detalhes do provedor. */}
 return {ok:true,message:generic};
}
export async function completeDriverAccessAction(_state:DriverAccessState,form:FormData):Promise<DriverAccessState>{
 const input=z.object({userId:z.string().min(1).max(100),token:z.string().regex(/^[a-f0-9]{64}$/),mode:modeSchema,password:passwordSchema.refine(value=>Buffer.byteLength(value,'utf8')<=72,'Use uma senha de até 72 bytes.'),confirm:z.string()}).refine(v=>v.password===v.confirm,{message:'As senhas precisam ser iguais.'}).safeParse(Object.fromEntries(['userId','token','mode','password','confirm'].map(key=>[key,form.get(key)])));
 if(!input.success)return {ok:false,message:input.error.issues[0]?.message??'Confira os dados.'};
 let email:string;
 try{email=await consumeDriverAccess(input.data.userId,input.data.token,input.data.mode,input.data.password);}catch(error){return {ok:false,message:error instanceof OperationError?error.message:'Não foi possível verificar este link. Solicite outro.'};}
 try{await signIn('credentials',{login:email,password:input.data.password,driverOnly:'true',remember:form.get('remember')==='on'?'true':'false',redirectTo:'/entregador'});}catch(error){if(error instanceof AuthError)return {ok:true,message:'Senha definida. Entre com seu e-mail e a nova senha.'};throw error;}
 return {ok:true,message:'Acesso ativado.'};
}
