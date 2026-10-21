import 'server-only';
import type {Prisma} from '@prisma/client';

/** Credenciais de operador central nunca são administradas por uma loja. */
export async function isPlatformIdentity(client:Prisma.TransactionClient,userId:string):Promise<boolean>{
 const rows=await client.$queryRaw<Array<{ready:boolean}>>`SELECT to_regclass('public."PlatformOperator"') IS NOT NULL AS ready`;
 if(rows.length!==1)throw new Error('Não foi possível verificar o tipo da conta.');
 if(!rows[0].ready)return false;
 return Boolean(await client.platformOperator.findUnique({where:{userId},select:{id:true}}));
}
