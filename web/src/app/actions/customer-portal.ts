'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { withOrganizationTransaction } from '@/lib/data/transaction';
import { verifyPassword,hashPassword } from '@/lib/auth/password';
import { toActionError } from '@/lib/auth/guards';
import { OperationError } from '@/lib/operation-error';
import { fullNameSchema,brazilPhoneSchema,addressSchema,passwordSchema,safeReturnPath } from '@/lib/customer-portal/policy';
import { registerPortalAccount,loginPortalAccount,logoutPortalAccount,requestPortalReset,consumePortalToken,requireCustomerAccount,changePortalEmail } from '@/lib/customer-portal/server';

export type CustomerPortalState={ok:boolean;message:string;redirect?:string;field?:string}|undefined;
export async function customerPortalAction(_previous:CustomerPortalState,form:FormData):Promise<CustomerPortalState>{
  const slug=String(form.get('slug')??''),action=String(form.get('action')??'');
  const value=(key:string)=>String(form.get(key)??'');
  // Server redirect: clearing the cookie re-renders the current (protected) page, which would otherwise win the navigation.
  if(action==='logout'){await logoutPortalAccount(slug);redirect(`/loja/${slug}/`);}
  try{
    if(action==='register'){
      const result=await registerPortalAccount(slug,{name:value('name'),email:value('email'),phone:value('phone'),password:value('password'),confirmPassword:value('confirmPassword'),acceptTerms:form.get('acceptTerms')==='on'},form.get('remember')==='on');
      if(result==='session')return {ok:true,message:'Conta criada. Você já está conectado.',redirect:safeReturnPath(slug,value('voltar'))};
      return {ok:true,message:'Se este endereço puder ser cadastrado ou estiver pendente, siga a confirmação enviada por e-mail. Se já tem uma conta ativa, entre ou recupere sua senha.'};
    }
    if(action==='login'){await loginPortalAccount(slug,value('email'),value('password'),form.get('remember')==='on');return {ok:true,message:'Você entrou na sua conta.',redirect:safeReturnPath(slug,value('voltar'))};}
    if(action==='recover'){await requestPortalReset(slug,value('email'));return {ok:true,message:'Se houver uma conta ativa para este e-mail, siga o link de recuperação. Confira também a pasta de spam.'};}
    if(action==='confirm'){await consumePortalToken(slug,value('token'),value('password'),value('confirmPassword'));await logoutPortalAccount(slug);return {ok:true,message:'Solicitação confirmada. Entre na sua conta.',redirect:`/loja/${slug}/conta/entrar`};}
    const account=await requireCustomerAccount(slug);
    if(action==='profile'){
      const name=fullNameSchema.parse(value('name')),phone=value('phone').trim()?brazilPhoneSchema.parse(value('phone')):'';
      await prisma.customerPortalAccount.update({where:{id:account.id,organizationId:account.organizationId},data:{firstName:name,phone:phone||null}});
    }else if(action==='email'){
      await changePortalEmail(slug,value('email'),value('currentPassword'));return {ok:true,message:'Confirme o novo endereço pelo link enviado. O e-mail atual permanece válido até a confirmação.'};
    }else if(action==='password'){
      if(!await verifyPassword(value('currentPassword'),account.passwordHash))throw new OperationError('Senha atual incorreta.');
      const password=passwordSchema.parse(value('password'));if(password!==value('confirmPassword'))throw new OperationError('As senhas não coincidem.');
      const passwordHash=await hashPassword(password);
      await withOrganizationTransaction(account.organizationId,async tx=>{
        const changed=await tx.customerPortalAccount.updateMany({where:{id:account.id,organizationId:account.organizationId,passwordHash:account.passwordHash,active:true},data:{passwordHash}});
        if(changed.count!==1)throw new OperationError('A conta mudou. Entre novamente.');
        await tx.customerPortalSession.deleteMany({where:{accountId:account.id}});await tx.customerPortalToken.deleteMany({where:{accountId:account.id}});
      });
      await logoutPortalAccount(slug);return {ok:true,message:'Senha alterada. Entre novamente.',redirect:`/loja/${slug}/conta/entrar`};
    }else if(action==='address'){
      const data=addressSchema.parse({id:value('id')||undefined,label:value('label'),street:value('street'),number:value('number'),complement:value('complement'),district:value('district'),city:value('city'),state:value('state').toUpperCase(),zipCode:value('zipCode'),isDefault:form.get('isDefault')==='on'});
      await withOrganizationTransaction(account.organizationId,async tx=>{
        if(data.id&&!await tx.customerPortalAddress.findFirst({where:{id:data.id,accountId:account.id}}))throw new OperationError('Endereço não encontrado.');
        const count=await tx.customerPortalAddress.count({where:{accountId:account.id}});if(!data.id&&count>=20)throw new OperationError('Você pode manter até 20 endereços.');
        const isDefault=data.isDefault||count===0;if(isDefault)await tx.customerPortalAddress.updateMany({where:{accountId:account.id},data:{isDefault:false}});
        const {id,...address}=data;
        if(id)await tx.customerPortalAddress.update({where:{id,accountId:account.id},data:{...address,isDefault}});
        else await tx.customerPortalAddress.create({data:{...address,isDefault,accountId:account.id}});
      });
    }else if(action==='delete-address'){
      if(form.get('confirm')!=='on')throw new OperationError('Confirme a exclusão do endereço.');
      await withOrganizationTransaction(account.organizationId,async tx=>{
        const address=await tx.customerPortalAddress.findFirst({where:{id:value('id'),accountId:account.id}});if(!address)throw new OperationError('Endereço não encontrado.');
        await tx.customerPortalAddress.delete({where:{id:address.id,accountId:account.id}});
        if(address.isDefault){const next=await tx.customerPortalAddress.findFirst({where:{accountId:account.id},orderBy:{createdAt:'asc'}});if(next)await tx.customerPortalAddress.update({where:{id:next.id},data:{isDefault:true}});}
      });
    }else if(action==='preferences')await prisma.customerPortalAccount.update({where:{id:account.id,organizationId:account.organizationId},data:{marketingOptIn:form.get('marketingOptIn')==='on'}});
    else if(action==='read-notices')await prisma.customerPortalAccount.update({where:{id:account.id,organizationId:account.organizationId},data:{noticesReadAt:new Date()}});
    else throw new OperationError('Ação inválida.');
    revalidatePath(`/loja/${slug}/conta`,'layout');return {ok:true,message:'Alterações salvas.'};
  }catch(error){return error instanceof z.ZodError?{ok:false,message:error.issues[0]?.message??'Confira os campos.',field:String(error.issues[0]?.path[0]??'')}:{ok:false,message:toActionError(error).error};}
}
