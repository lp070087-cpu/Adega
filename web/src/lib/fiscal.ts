import { z } from 'zod';
import { BR_UFS } from './br-ufs';

export const FISCAL_REGIMES = [
  ['SIMPLES', 'Simples Nacional'], ['MEI', 'MEI'],
  ['PRESUMIDO', 'Lucro Presumido'], ['REAL', 'Lucro Real'],
] as const;

const cleanDigits = (value: string) => value.replace(/[.\/\s-]/g, '');
export function validFiscalCnpj(value: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (length: number) => {
    const sum = [...value.slice(0, length)].reduce((total, char, i) => total + (char.charCodeAt(0) - 48) * ((length - 1 - i) % 8 + 2), 0);
    const remainder = sum % 11;
    return (remainder < 2 ? 0 : 11 - remainder) === Number(value[length]);
  };
  return digit(12) && digit(13);
}

const cnpj = z.string().transform((value) => cleanDigits(value).toUpperCase()).refine(
  (value) => value === '' || /^[A-Z0-9]{12}\d{2}$/.test(value),
  'Informe o CNPJ com 14 caracteres.',
);

export const fiscalProfileSchema = z.object({
  legalName: z.string().trim().max(160),
  cnpj,
  stateRegistration: z.string().trim().max(20),
  uf: z.enum(['', ...BR_UFS]).default(''),
  regime: z.enum(['', 'SIMPLES', 'MEI', 'PRESUMIDO', 'REAL']),
  documentType: z.enum(['NFCE', 'NFE', 'NONE']),
  notes: z.string().trim().max(500),
});
export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;
export const EMPTY_FISCAL: FiscalProfile = {
  legalName: '', cnpj: '', stateRegistration: '', uf: '', regime: '', documentType: 'NONE', notes: '',
};

export function fiscalSettings(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
}

export function readFiscalProfile(settings: unknown): FiscalProfile {
  const parsed = fiscalProfileSchema.safeParse(fiscalSettings(settings).fiscal);
  return parsed.success ? parsed.data : EMPTY_FISCAL;
}

export function fiscalProfileProblems(profile: FiscalProfile): string[] {
  const problems: string[] = [];
  if (!profile.legalName || !validFiscalCnpj(profile.cnpj)) problems.push('razão social e CNPJ');
  if (!profile.stateRegistration || !profile.regime) problems.push('inscrição estadual e regime');
  if (!profile.uf) problems.push('UF do emitente');
  if (profile.documentType !== 'NFCE') problems.push('documento NFC-e');
  return problems;
}

const digits = (regex: RegExp, label: string) => z.string().trim().transform(cleanDigits).pipe(z.string().regex(regex, label));
const icmsCodes = ['102', '103', '300', '400', '500', '00', '40', '41', '60'] as const;
const contributionCodes = ['01', '02', '04', '05', '06', '07', '08', '09', '49', '99'] as const;

export const productFiscalSchema = z.object({
  ncm: digits(/^\d{8}$/, 'Informe o NCM com oito dígitos.'),
  cest: digits(/^(?:\d{7})?$/, 'Informe o CEST com sete dígitos ou deixe em branco.'),
  cfop: digits(/^5\d{3}$/, 'Informe um CFOP de operação interna, iniciado em 5.'),
  origin: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8']),
  icmsCode: z.enum(icmsCodes, { message: 'Selecione um código ICMS atendido pelo emissor.' }),
  icmsRate: z.number().finite().min(0).max(100).nullable(),
  pisCode: z.enum(contributionCodes, { message: 'Selecione um CST de PIS atendido pelo emissor.' }),
  pisRate: z.number().finite().min(0).max(100).nullable(),
  cofinsCode: z.enum(contributionCodes, { message: 'Selecione um CST de COFINS atendido pelo emissor.' }),
  cofinsRate: z.number().finite().min(0).max(100).nullable(),
  unit: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, 'Informe a unidade comercial com até seis caracteres.'),
}).superRefine((item, ctx) => {
  if (['500', '60'].includes(item.icmsCode) && !item.cest) {
    ctx.addIssue({ code: 'custom', path: ['cest'], message: 'Informe o CEST do item com ICMS-ST.' });
  }
  for (const [applies, rate, path, label] of [
    [item.icmsCode === '00', item.icmsRate, 'icmsRate', 'ICMS'],
    [['01', '02'].includes(item.pisCode), item.pisRate, 'pisRate', 'PIS'],
    [['01', '02'].includes(item.cofinsCode), item.cofinsRate, 'cofinsRate', 'COFINS'],
  ] as const) {
    if (applies && rate === null) ctx.addIssue({ code: 'custom', path: [path], message: `Informe a alíquota de ${label}.` });
  }
});
export type ProductFiscal = z.infer<typeof productFiscalSchema>;
export const FISCAL_ICMS_CODES = icmsCodes;
export const FISCAL_CONTRIBUTION_CODES = contributionCodes;

export function readProductFiscal(settings: unknown, productId: string | null): ProductFiscal | null {
  if (!productId) return null;
  const records = fiscalSettings(fiscalSettings(settings).fiscalProducts);
  const parsed = productFiscalSchema.safeParse(records[productId]);
  return parsed.success ? parsed.data : null;
}

export function checkProductRegime(profile: FiscalProfile, product: ProductFiscal) {
  const simple = profile.regime === 'SIMPLES' || profile.regime === 'MEI';
  if (simple !== (product.icmsCode.length === 3)) {
    throw new Error(simple ? 'Use um CSOSN compatível com o regime do emitente.' : 'Use um CST de ICMS compatível com o regime do emitente.');
  }
}

export const FISCAL_URLS = {
  gov: 'https://sso.acesso.gov.br/login',
  pe: 'https://www.sefaz.pe.gov.br/Servicos/Nota-Fiscal-de-Consumidor-Eletronica/Paginas/Credenciamento-de-Contribuintes.aspx',
  peAccess: 'https://efisco.sefaz.pe.gov.br/sfi_com_sca/Menu/',
  national: 'https://www.nfe.fazenda.gov.br/portal/',
  provider: 'https://doc.focusnfe.com.br/docs/nfce-requisitos-de-credenciamento',
} as const;
