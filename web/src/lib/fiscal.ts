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
});
export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;
export const EMPTY_FISCAL: FiscalProfile = { legalName: '', cnpj: '', stateRegistration: '', regime: '', documentType: 'NONE', notes: '' };

export function readFiscalProfile(settings: unknown): FiscalProfile {
  const root = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const parsed = fiscalProfileSchema.safeParse(root.fiscal);
  return parsed.success ? parsed.data : EMPTY_FISCAL;
}

/** O que falta para poder emitir. Integração e certificado são sempre externos. */
export function fiscalReadiness(profile: FiscalProfile) {
  return [
    { label: 'Razão social e CNPJ', ok: Boolean(profile.legalName && profile.cnpj.length === 14) },
    { label: 'Inscrição estadual e regime tributário', ok: Boolean(profile.stateRegistration && profile.regime) },
    { label: 'Tipo de documento definido (NFC-e para venda ao consumidor)', ok: profile.documentType !== 'NONE' },
    { label: 'Provedor de emissão homologado contratado e integrado', ok: false },
    { label: 'Certificado digital A1 e CSC cadastrados no provedor', ok: false },
    { label: 'Testes em homologação da SEFAZ aprovados', ok: false },
  ];
}
