import { z } from 'zod';

export const stockInlineSchema = z.object({
  productId: z.string().min(1).max(100),
  field: z.enum(['stock', 'minimumStock', 'cost', 'price']),
  value: z.number().finite().min(0).max(999999),
  previousValue: z.number().finite().min(0).max(999999).nullable(),
  reason: z.string().trim().min(5).max(200),
}).superRefine((data, ctx) => {
  if (['stock', 'minimumStock'].includes(data.field) && !Number.isSafeInteger(data.value))
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Informe uma quantidade inteira.' });
  if (['price', 'cost'].includes(data.field) && Math.abs(data.value * 100 - Math.round(data.value * 100)) > 0.000001)
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Use no máximo duas casas decimais.' });
});
