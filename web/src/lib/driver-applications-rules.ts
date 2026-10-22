import { z } from 'zod';
import { emailSchema, passwordSchema } from './validations/common';

export const driverRegistrationSchema=z.object({
  name:z.string().trim().min(2,'Informe seu primeiro nome.').max(80).regex(/^[\p{L}][\p{L}\p{M}' -]*$/u,'Nome inválido.'),
  email:emailSchema,password:passwordSchema,confirmPassword:z.string(),
}).refine(v=>v.password===v.confirmPassword,{path:['confirmPassword'],message:'As senhas não coincidem.'});
export const applicationStatuses=['PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED'] as const;
export type ApplicationStatus=typeof applicationStatuses[number];
export const applicationLabels:Record<ApplicationStatus,string>={PENDING:'Aguardando aprovação',APPROVED:'Aprovado',REJECTED:'Rejeitado',SUSPENDED:'Suspenso',REVOKED:'Acesso revogado'};
export function registrationSlug(name:string){return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100)||'loja';}
export function registrationPath(link:{slug:string;number:number}){return `/entregador/${link.slug}/${String(link.number).padStart(4,'0')}`;}
export function validApplicationTransition(from:string,to:ApplicationStatus){return from!==to&&({PENDING:['APPROVED','REJECTED'],APPROVED:['SUSPENDED','REVOKED'],REJECTED:['PENDING'],SUSPENDED:['APPROVED','REVOKED'],REVOKED:['PENDING']} as Record<string,string[]>)[from]?.includes(to)===true;}
