import { z } from 'zod';

/**
 * Cadastro fiscal da loja (dados públicos da empresa, sem credenciais).
 * A emissão de NFC-e/NF-e depende de um provedor homologado, certificado
 * digital e CSC — nada disso fica aqui nem é simulado. Enquanto não houver
 * integração, o estado é sempre "emissão desativada".
 */
export const FISCAL_REGIMES = [
  ['SIMPLES', 'Simples Nacional'],
  ['MEI', 'MEI'],
  ['PRESUMIDO', 'Lucro Presumido'],
  ['REAL', 'Lucro Real'],
] as const;

export const fiscalProfileSchema = z.object({
  legalName: z.string().trim().max(160),
  cnpj: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v === '' || v.length === 14, 'CNPJ deve ter 14 dígitos'),
  stateRegistration: z.string().trim().max(20),
  regime: z.enum(['', 'SIMPLES', 'MEI', 'PRESUMIDO', 'REAL']),
  documentType: z.enum(['NFCE', 'NFE', 'NONE']),
  notes: z.string().trim().max(500),
  // Padrões tributários dos itens (confirmar com o contador). Produtos sem NCM próprio usam estes.
  defaultNcm: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v === '' || v.length === 8, 'NCM deve ter 8 dígitos').default(''),
  defaultCfop: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v === '' || v.length === 4, 'CFOP deve ter 4 dígitos').default('5102'),
  icmsCode: z.string().transform((v) => v.replace(/\D/g, '')).refine((v) => v === '' || /^\d{2,3}$/.test(v), 'CSOSN/CST inválido').default(''),
  origin: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8']).default('0'),
});
export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;
export const EMPTY_FISCAL: FiscalProfile = { legalName: '', cnpj: '', stateRegistration: '', regime: '', documentType: 'NONE', notes: '', defaultNcm: '', defaultCfop: '5102', icmsCode: '', origin: '0' };

export function readFiscalProfile(settings: unknown): FiscalProfile {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const parsed = fiscalProfileSchema.safeParse(root.fiscal);
  return parsed.success ? parsed.data : EMPTY_FISCAL;
}

/** Campos tributários obrigatórios para montar uma NFC-e. */
export function fiscalProfileProblems(profile: FiscalProfile): string[] {
  const problems: string[] = [];
  if (!profile.legalName || profile.cnpj.length !== 14) problems.push('Razão social e CNPJ');
  if (!profile.stateRegistration) problems.push('Inscrição estadual');
  if (!profile.regime) problems.push('Regime tributário');
  if (profile.documentType !== 'NFCE') problems.push('Tipo de documento NFC-e');
  if (profile.defaultNcm.length !== 8) problems.push('NCM padrão dos produtos');
  if (profile.defaultCfop.length !== 4) problems.push('CFOP');
  if (!profile.icmsCode) problems.push('CSOSN/CST do ICMS');
  return problems;
}

/** O que falta para poder emitir. Certificado, CSC e habilitação na SEFAZ ficam no provedor. */
export function fiscalReadiness(profile: FiscalProfile, provider: { configured: boolean; homologated: boolean } = { configured: false, homologated: false }) {
  return [
    { label: 'Razão social e CNPJ', ok: Boolean(profile.legalName && profile.cnpj.length === 14) },
    { label: 'Inscrição estadual e regime tributário', ok: Boolean(profile.stateRegistration && profile.regime) },
    { label: 'Tipo de documento definido (NFC-e para venda ao consumidor)', ok: profile.documentType !== 'NONE' },
    { label: 'Tributação padrão dos itens (NCM, CFOP e CSOSN/CST)', ok: profile.defaultNcm.length === 8 && profile.defaultCfop.length === 4 && Boolean(profile.icmsCode) },
    { label: 'Provedor de emissão contratado e token cadastrado aqui', ok: provider.configured },
    { label: 'Certificado digital A1 e CSC cadastrados no painel do provedor', ok: provider.homologated },
    { label: 'NFC-e autorizada em homologação da SEFAZ (teste)', ok: provider.homologated },
  ];
}
