import { z } from 'zod';
import { Role, VehicleType } from '@prisma/client';
import { moneyInputSchema, optionalText, phoneSchema, requiredText, usernameSchema } from './common';

// ── CLIENTES ───────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name: requiredText('Nome', 2, 120),
  phone: phoneSchema,
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  notes: optionalText(500),
});

export const customerAddressSchema = z.object({
  customerId: z.string().min(1),
  label: optionalText(40),
  street: requiredText('Rua', 3, 200),
  number: optionalText(20),
  complement: optionalText(120),
  district: optionalText(120),
  city: optionalText(120),
  state: optionalText(2),
  zipCode: optionalText(9),
  isDefault: z.boolean().default(false),
});

// ── ENTREGADORES ───────────────────────────────────────────────────────

export const driverSchema = z.object({
  name: requiredText('Nome', 2, 120),
  phone: phoneSchema,
  vehicleType: z.nativeEnum(VehicleType).default('MOTORCYCLE'),
  vehiclePlate: optionalText(10),
  active: z.boolean().default(true),
});

export const driverStatusSchema = z.object({
  driverId: z.string().min(1),
  status: z.enum(['OFFLINE', 'ONLINE', 'BUSY', 'RETURNING']),
});

/**
 * Cria também o login do entregador (User + OrganizationUser com role
 * DRIVER). Sem isso ele não consegue abrir /entregador.
 *
 * Duas opções de acesso, MUTUAMENTE excludentes na prática (o servidor
 * exige ao menos uma): e-mail (OPÇÃO A) OU nome de usuário (OPÇÃO B).
 * Nenhum e-mail falso é inventado — quem não tem e-mail usa o login.
 */
export const createDriverWithLoginSchema = driverSchema.extend({
  createLogin: z.boolean().default(false),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  username: usernameSchema.optional().or(z.literal('')),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72).optional().or(z.literal('')),
});

/** Envio de posição pelo app do entregador. */
export const driverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(10000).optional(),
});

// ── EQUIPE ─────────────────────────────────────────────────────────────

export const teamMemberSchema = z.object({
  name: requiredText('Nome', 2, 120),
  email: z.string().email('E-mail inválido'),
  phone: phoneSchema.optional(),
  role: z.nativeEnum(Role),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72).optional().or(z.literal('')),
  /** Nome do turno (texto livre: "Manhã", "Noite"). */
  shift: optionalText(40),
});

export const updateTeamMemberSchema = z.object({
  memberId: z.string().min(1),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  shift: optionalText(40),
});

// ── CAIXA ──────────────────────────────────────────────────────────────

export const cashRegisterSchema = z.object({
  name: requiredText('Nome do caixa', 2, 60),
  active: z.boolean().default(true),
});

export const openCashShiftSchema = z.object({
  cashRegisterId: z.string().min(1, 'Escolha o caixa'),
  openingAmount: moneyInputSchema.default(0),
});

export const closeCashShiftSchema = z.object({
  cashShiftId: z.string().min(1),
  closingAmount: moneyInputSchema,
  notes: optionalText(300),
});

/** Sangria (WITHDRAWAL) e suprimento (SUPPLY). */
export const cashTransactionSchema = z.object({
  cashShiftId: z.string().min(1),
  type: z.enum(['SUPPLY', 'WITHDRAWAL', 'ADJUSTMENT', 'REFUND']),
  amount: moneyInputSchema.refine((v) => v > 0, 'Informe um valor maior que zero'),
  description: optionalText(200),
});

// ── ESTOQUE ────────────────────────────────────────────────────────────

export const inventoryFilterSchema = z.object({
  productId: z.string().optional(),
  type: z
    .enum(['IN', 'OUT', 'ADJUSTMENT', 'SALE', 'CANCELLATION'])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(50),
});

// ── RELATÓRIOS ─────────────────────────────────────────────────────────

export const reportPeriodSchema = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('today'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

// ── INTEGRAÇÕES ────────────────────────────────────────────────────────

/**
 * Credencial de integração. O payload vai cifrado para
 * IntegrationCredential.encryptedPayload — nunca em texto puro, nunca
 * para o frontend.
 */
export const integrationCredentialSchema = z.object({
  provider: z.enum(['IFOOD', 'FOOD99', 'ZE_DELIVERY', 'GOOGLE_MAPS']),
  payload: z.record(z.string().max(4000)).refine(
    (obj) => Object.keys(obj).length > 0,
    'Informe ao menos um campo de credencial',
  ),
});

export type DriverInput = z.infer<typeof driverSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
