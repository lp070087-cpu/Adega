'use client';

import { useActionState } from 'react';
import { saveFiscalProfileAction } from '@/app/actions/fiscal';
import { FISCAL_REGIMES, type FiscalProfile } from '@/lib/fiscal';

export function FiscalProfileForm({ profile }: { profile: FiscalProfile }) {
  const [state, action, pending] = useActionState(saveFiscalProfileAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" data-testid="fiscal-form">
      <label className="sm:col-span-2"><span className="field-label">Razão social</span><input name="legalName" defaultValue={profile.legalName} maxLength={160} className="field-input" /></label>
      <label><span className="field-label">CNPJ</span><input name="cnpj" defaultValue={profile.cnpj} inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" className="field-input" /></label>
      <label><span className="field-label">Inscrição estadual</span><input name="stateRegistration" defaultValue={profile.stateRegistration} maxLength={20} className="field-input" /></label>
      <label><span className="field-label">Regime tributário</span>
        <select name="regime" defaultValue={profile.regime} className="field-input"><option value="">Selecione</option>{FISCAL_REGIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
      <label><span className="field-label">Documento nas vendas</span>
        <select name="documentType" defaultValue={profile.documentType} className="field-input">
          <option value="NONE">Ainda não definido</option>
          <option value="NFCE">NFC-e (venda ao consumidor)</option>
          <option value="NFE">NF-e (venda para empresas)</option>
        </select>
      </label>
      <p className="text-[0.76rem] font-semibold text-ink-700 sm:col-span-2">Tributação padrão dos itens <span className="font-normal text-ink-500">— confirme com o contador; vale para os produtos sem cadastro próprio.</span></p>
      <label><span className="field-label">NCM padrão</span><input name="defaultNcm" defaultValue={profile.defaultNcm} inputMode="numeric" maxLength={10} placeholder="Ex.: 22030000 (cerveja)" className="field-input" /></label>
      <label><span className="field-label">CFOP</span><input name="defaultCfop" defaultValue={profile.defaultCfop} inputMode="numeric" maxLength={4} placeholder="5102" className="field-input" /></label>
      <label><span className="field-label">CSOSN / CST do ICMS</span><input name="icmsCode" defaultValue={profile.icmsCode} inputMode="numeric" maxLength={3} placeholder="Ex.: 102 (Simples)" className="field-input" /></label>
      <label><span className="field-label">Origem da mercadoria</span>
        <select name="origin" defaultValue={profile.origin} className="field-input"><option value="0">0 · Nacional</option><option value="1">1 · Estrangeira (importação direta)</option><option value="2">2 · Estrangeira (mercado interno)</option></select>
      </label>
      <label className="sm:col-span-2"><span className="field-label">Observações para o contador</span><textarea name="notes" defaultValue={profile.notes} maxLength={500} rows={2} className="field-input" /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar cadastro fiscal'}</button>
        {state && <p role="status" className={`text-[0.8rem] ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
