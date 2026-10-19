'use server';
import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { z } from 'zod';
export async function adminLoginAction(_prev:{error:string},form:FormData):Promise<{error:string}>{
 if(process.env.PLATFORM_ADMIN_ENABLED!=='true')return {error:'Acesso administrativo indisponível.'};
 const parsed=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).safeParse({email:form.get('email'),password:form.get('password')});
 if(!parsed.success)return {error:'Confira seu e-mail e senha.'};
 try{await signIn('credentials',{login:parsed.data.email,password:parsed.data.password,redirectTo:'/admin'});return {error:''};}catch(error){if(error instanceof AuthError)return {error:'Não foi possível entrar com estas credenciais.'};throw error;}
}
