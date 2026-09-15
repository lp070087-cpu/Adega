import { z } from 'zod';

/**
 * Peças de validação reutilizadas. Toda entrada vinda do cliente passa
 * por aqui ANTES de chegar ao Prisma — validação de frontend é UX,
 * não segurança.
 */

/** Texto obrigatório, com tamanho controlado e sem espaço nas pontas. */
export function requiredText(label: string, min = 1, max = 160) {
  return z
    .string({ required_error: `${label} é obrigatório` })
    .trim()
    .min(min, `${label} precisa ter ao menos ${min} caractere(s)`)
    .max(max, `${label} deve ter no máximo ${max} caracteres`);
}

export function optionalText(max = 500) {
  return z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v));
}

/** Telefone brasileiro: 10 ou 11 dígitos (fixo/celular), com ou sem máscara. */
export const phoneSchema = z
  .string({ required_error: 'Telefone é obrigatório' })
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 10 || v.length === 11, 'Telefone inválido')
  .refine((v) => !(v.length === 11 && v[2] !== '9'), 'Celular deve começar com 9 após o DDD');

/** WhatsApp com DDI 55 (formato aceito pelo link wa.me). */
export const whatsappSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 12 || v.length === 13, 'WhatsApp deve incluir o DDI 55')
  .refine((v) => v.startsWith('55'), 'WhatsApp deve começar com 55');

export const emailSchema = z
  .string({ required_error: 'E-mail é obrigatório' })
  .trim()
  .toLowerCase()
  .email('E-mail inválido')
  .max(160);

/**
 * Senha. Mínimo 8 com letra e número — exigência baixa o bastante para
 * não empurrar o lojista para "123456", alta o bastante para resistir
 * a um ataque de dicionário trivial.
 */
export const passwordSchema = z
  .string({ required_error: 'Senha é obrigatória' })
  .min(8, 'A senha precisa ter ao menos 8 caracteres')
  .max(72, 'A senha deve ter no máximo 72 caracteres')
  .regex(/[A-Za-zÀ-ÿ]/, 'A senha precisa conter ao menos uma letra')
  .regex(/\d/, 'A senha precisa conter ao menos um número');

/** Dinheiro em reais. Rejeita negativo e limita a 2 casas. */
export const moneySchema = z
  .number({ invalid_type_error: 'Valor inválido' })
  .min(0, 'Valor não pode ser negativo')
  .max(999999.99, 'Valor acima do limite')
  .refine((v) => Number.isFinite(v), 'Valor inválido')
  .transform((v) => Math.round(v * 100) / 100);

/** Aceita "29,90" ou 29.9 e devolve number. Usado nos formulários. */
export const moneyInputSchema = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === 'number') return v;
    // Formato BR: ponto é separador de milhar, vírgula é decimal.
    const normalized = v.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return Number(normalized);
  })
  .pipe(moneySchema);

/** Quantidade inteira positiva (estoque, itens do pedido). */
export const quantitySchema = z
  .number({ invalid_type_error: 'Quantidade inválida' })
  .int('Quantidade deve ser um número inteiro')
  .min(0, 'Quantidade não pode ser negativa')
  .max(999999, 'Quantidade acima do limite');

/** CNPJ: 14 dígitos, com validação dos dígitos verificadores. */
export const cnpjSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos')
  .refine(isValidCnpj, 'CNPJ inválido');

function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  // Rejeita sequências repetidas (00000000000000, 11111111111111...).
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (slice: number): number => {
    let sum = 0;
    let pos = slice - 7;
    for (let i = slice; i >= 1; i--) {
      sum += Number(cnpj[slice - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const result = sum % 11;
    return result < 2 ? 0 : 11 - result;
  };

  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** CEP: 8 dígitos. */
export const zipCodeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, 'CEP deve ter 8 dígitos');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Slug muito curto')
  .max(60, 'Slug muito longo')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use apenas letras, números e hífen');

/**
 * Login alternativo do entregador (OPÇÃO B, sem e-mail).
 *
 * Normalizado em minúsculas. Único GLOBALMENTE no User.username — é ele
 * que resolve o login em /entregador. Permitir ponto/underline/sublinhado
 * deixa nomes como "joao.silva" ou "carla_souza" sem empurrar o lojista
 * para um nome artificial.
 */
export const usernameSchema = z
  .string({ required_error: 'Informe um nome de usuário' })
  .trim()
  .toLowerCase()
  .min(3, 'O nome de usuário precisa ter ao menos 3 caracteres')
  .max(30, 'O nome de usuário deve ter no máximo 30 caracteres')
  .regex(/^[a-z0-9._-]+$/, 'Use apenas letras minúsculas, números, ponto, hífen ou underline');

/** Cor hexadecimal (#RRGGBB) — usada no brandColor. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar no formato #RRGGBB');

/** Coordenada geográfica. */
export const latitudeSchema = z.number().min(-90).max(90);
export const longitudeSchema = z.number().min(-180).max(180);

/** CUID do Prisma — impede que um id forjado chegue à query. */
export const idSchema = z
  .string()
  .trim()
  .min(1, 'Identificador obrigatório')
  .max(64, 'Identificador inválido')
  .regex(/^[a-z0-9]+$/i, 'Identificador inválido');

/**
 * organizationId NUNCA é aceito do cliente.
 * Existe apenas para dar mensagem clara caso alguém tente enviá-lo:
 * o schema rejeita e o log registra a tentativa.
 */
export const forbiddenOrganizationId = z
  .unknown()
  .optional()
  .refine((v) => v === undefined, {
    message:
      'organizationId não pode ser enviado pelo cliente — ele vem da sessão.',
  });
