import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, requiredText } from './common';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Senha é obrigatória' }).min(1, 'Informe a senha').max(72),
});

/**
 * Identificador de login: e-mail OU nome de usuário.
 *
 * O painel da loja sempre tem e-mail; o entregador OPÇÃO B não tem — e o
 * login dele precisa aceitar o username. Em vez de dois campos e um
 * "se tem @ é e-mail" escondido no servidor, o formulário usa UM campo
 * (`login`) e o authorize decide a consulta pelo conteúdo.
 */
export const identifierSchema = z
  .string({ required_error: 'Informe e-mail ou nome de usuário' })
  .trim()
  .toLowerCase()
  .min(3, 'E-mail ou nome de usuário muito curto')
  .max(160, 'E-mail ou nome de usuário muito longo');

/** Login da Área do Entregador: um identificador (e-mail ou username) + senha. */
export const driverLoginSchema = z.object({
  login: identifierSchema,
  password: z.string({ required_error: 'Senha é obrigatória' }).min(1, 'Informe a senha').max(72),
});

export const registerSchema = z
  .object({
    name: requiredText('Nome', 2, 120),
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
