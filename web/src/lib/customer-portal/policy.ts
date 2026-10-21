import { z } from 'zod';
export const firstNameSchema=z.string().trim().min(2,'Informe seu nome').max(120).regex(/^[\p{L}][\p{L}\p{M} '\u2019-]*$/u,'Informe um nome válido');
export const emailSchema=z.string().trim().toLowerCase().email('E-mail inválido').max(254);
export const passwordSchema=z.string().min(8,'Use pelo menos oito caracteres').max(72).refine(value=>new TextEncoder().encode(value).length<=72,'Senha muito longa');
export const registrationSchema=z.object({name:firstNameSchema,email:emailSchema,password:passwordSchema,confirmPassword:z.string()}).refine(value=>value.password===value.confirmPassword,{message:'As senhas não coincidem',path:['confirmPassword']});
export const addressSchema=z.object({id:z.string().max(100).optional(),label:z.string().trim().max(40).optional(),street:z.string().trim().min(3).max(200),number:z.string().trim().min(1).max(20),complement:z.string().trim().max(120).optional(),district:z.string().trim().min(2).max(120),city:z.string().trim().min(2).max(120),state:z.string().trim().regex(/^[A-Z]{2}$/,'Informe a UF'),zipCode:z.string().transform(value=>value.replace(/\D/g,'')).refine(value=>/^\d{8}$/.test(value),'CEP inválido'),isDefault:z.boolean()});
export const PORTAL_TABLES=['CustomerPortalAccount','CustomerPortalSession','CustomerPortalToken','CustomerPortalAddress','CustomerPortalOrder'] as const;
export const validSlug=(slug:string)=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)&&slug.length<=160;
