'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnlinePaymentAction } from '@/app/actions/fiscal';

export function OnlinePaymentForm({ enabled, environment, configured, usable, webhookUrl }: { enabled: boolean; environment: 'sandbox' | 'production'; configured: boolean; usable: boolean; webhookUrl: string }) {
  const [state, action, pending] = useActionState(saveOnlinePaymentAction, null);
  const router = useRouter();
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  return (
    <form action={action} className="space-y-3" data-testid="online-payment-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink-900">Pagamento online no pedido (Pix e cartão)</h3>
        <span className={`rounded-full px-3 py-1 text-[0.74rem] font-bold ${usable ? 'bg-success-bg text-success' : 'bg-ink-100 text-ink-600'}`} data-testid="online-payment-status">{usable ? `Ativo · ${environment === 'sandbox' ? 'sandbox (teste)' : 'produção'}` : 'Desativado'}</span>
      </div>
      <p className="text-[0.8rem] text-ink-500">Usa a sua conta Asaas: o cliente paga no Pix (QR ou copia e cola) ou no cartão pela página segura do Asaas. O pedido só fica <strong>Pago</strong> quando o Asaas confirma pelo webhook.</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-[var(--brand)]" />Oferecer pagamento online no checkout</label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="field-label">Ambiente</span>
          <select name="environment" defaultValue={environment} className="field-input">
            <option value="sandbox">Sandbox (testes)</option>
            <option value="production">Produção (exige homologação)</option>
          </select>
        </label>
        <label><span className="field-label">Chave de API do Asaas</span><input name="apiKey" type="password" autoComplete="off" placeholder={configured ? '•••••••• (mantida)' : 'Cole a chave da sua conta'} className="field-input" /></label>
      </div>
      <div className="rounded-lg bg-ink-50 p-3 text-[0.78rem] text-ink-600">
        <p>No Asaas, cadastre o webhook com a URL abaixo, eventos de cobrança (<code>PAYMENT_*</code>) e o token gerado aqui.</p>
        <p className="mt-1 break-all font-mono text-[0.74rem] text-ink-800">{webhookUrl}</p>
        {configured && <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="regenerate" className="h-4 w-4" />Gerar novo token do webhook</label>}
      </div>
      {state?.webhookToken && <p className="rounded-lg border border-warn/40 bg-warn-bg p-3 text-[0.8rem] text-ink-800" data-testid="webhook-token">Token do webhook (copie agora, ele não será exibido de novo): <code className="break-all font-mono">{state.webhookToken}</code></p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar pagamento online'}</button>
        {state && <p role="status" className={`text-[0.8rem] ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>}
      </div>
    </form>
  );
}
