import { z } from 'zod';

/**
 * Validação do caixa.
 *
 * Os valores chegam como número (o componente manda número, não texto) e
 * são revalidados aqui: o servidor nunca confia no que o navegador diz
 * ser o valor de abertura ou de fechamento.
 */

const money = z
  .number({ invalid_type_error: 'Informe um valor.' })
  .finite('Valor inválido.')
  .min(0, 'O valor não pode ser negativo.')
  .max(1_000_000, 'Valor acima do limite permitido.')
  .transform((v) => Math.round(v * 100) / 100);

export const openShiftSchema = z.object({
  cashRegisterId: z.string().min(1, 'Escolha o caixa.'),
  openingAmount: money,
});

export const closeShiftSchema = z.object({
  cashShiftId: z.string().min(1, 'Turno inválido.'),
  closingAmount: money,
  notes: z.string().trim().max(500, 'Observação muito longa.').optional(),
});

export const cashTransactionSchema = z.object({
  cashShiftId: z.string().min(1, 'Turno inválido.'),
  type: z.enum(['SUPPLY', 'WITHDRAWAL', 'ADJUSTMENT', 'REFUND'], {
    errorMap: () => ({ message: 'Tipo de lançamento inválido.' }),
  }),
  amount: money.refine((v) => v > 0, 'O valor precisa ser maior que zero.'),
  description: z.string().trim().max(300, 'Descrição muito longa.').optional(),
});

export const cashRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe um nome para o caixa.')
    .max(80, 'Nome muito longo.'),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type CashTransactionInput = z.infer<typeof cashTransactionSchema>;
