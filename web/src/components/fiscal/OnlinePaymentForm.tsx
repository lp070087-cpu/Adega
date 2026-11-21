'use client';

import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnlinePaymentAction, testOnlinePaymentAction } from '@/app/actions/fiscal';

type Provider = 'infinitepay' | 'asaas' | 'mercadopago';

const PROVIDER_NAME: Record<Provider, string> = { infinitepay: 'InfinitePay', mercadopago: 'Mercado Pago', asaas: 'Asaas' };

export function OnlinePaymentForm({ enabled, environment, provider: initialProvider, configured, usable, verified, handle, webhookUrls }: { enabled: boolean; environment: 'sandbox' | 'production'; provider: Provider; configured: boolean; usable: boolean; verified: boolean; handle?: string; webhookUrls: Record<Provider, string> }) {
  const [state, action, pending] = useActionState(saveOnlinePaymentAction, null);
  const [provider, setProvider] = useState<Provider>(initialProvider);
  const router = useRouter();
  const [testing, startTest] = useTransition();
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const runTest = () => {
    setTest(null);
    startTest(async () => {
      setTest(await testOnlinePaymentAction().catch(() => ({ ok: false, message: 'Sem resposta do servidor. Tente novamente.' })));
      router.refresh();
    });
  };
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  const keep = configured && provider === initialProvider;
  const name = PROVIDER_NAME[provider];
  const infinite = provider === 'infinitepay';
  const statusLabel = usable
    ? `${verified ? 'Ativo' : 'Não confirmado'} · ${PROVIDER_NAME[initialProvider]}${initialProvider === 'infinitepay' ? '' : ` · ${environment === 'sandbox' ? 'teste' : 'produção'}`}`
    : 'Desativado';
  return (
    <form action={action} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => action(data)); }} className="space-y-3" data-testid="online-payment-form">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink-900">Pagamento online no pedido (Pix e cartão)</h3>
        <span className={`rounded-full px-3 py-1 text-[0.74rem] font-bold ${usable && verified ? 'bg-success-bg text-success' : usable ? 'bg-warn-bg text-warn' : 'bg-ink-100 text-ink-600'}`} data-testid="online-payment-status">{statusLabel}</span>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-3" aria-label="Provedor de pagamento">
        {(['infinitepay', 'mercadopago', 'asaas'] as const).map((p) => (
          <label key={p} className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold ${provider === p ? 'border-brand bg-brand-light text-brand' : 'border-ink-200 text-ink-700'}`}>
            <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => setProvider(p)} className="accent-[var(--brand)]" />
            {PROVIDER_NAME[p]}
          </label>
        ))}
      </fieldset>
      {infinite ? (
        <div className="space-y-1 text-[0.8rem] text-ink-500">
          <p>Usa a conta InfinitePay da própria loja: o dinheiro cai direto nela. No checkout, o cliente é levado à página segura da InfinitePay, paga no <strong>Pix ou no cartão</strong> e volta para o acompanhamento do pedido.</p>
          <p>O pedido só fica <strong>Pago</strong>, e só pode ser liberado para entrega, depois que o Del Flash confere o pagamento direto na InfinitePay.</p>
        </div>
      ) : (
        <p className="text-[0.8rem] text-ink-500">Usa a conta {name} da própria loja. O cliente paga no Pix (QR ou copia e cola) ou no cartão pela página segura do {name}; nenhum dado de cartão passa pelo Del Flash. O pedido só fica <strong>Pago</strong> quando o {name} confirma pelo webhook.</p>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-[var(--brand)]" />Oferecer pagamento online no checkout</label>
      {infinite ? (
        <label className="block"><span className="field-label">InfiniteTag da loja</span>
          <input name="handle" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={keep && handle ? `${handle} (mantida)` : 'Ex.: minhaadega'} className="field-input" data-testid="infinitepay-handle" />
          <span className="mt-1 block text-[0.74rem] text-ink-500">No app da InfinitePay, toque no seu perfil: é o nome que aparece com $ na frente. Digite sem o $.</span>
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="field-label">Ambiente</span>
            <select name="environment" defaultValue={environment} className="field-input">
              <option value="sandbox">Teste (sandbox)</option>
              <option value="production">Produção (exige homologação)</option>
            </select>
          </label>
          {provider === 'asaas' ? (
            <label><span className="field-label">Chave de API do Asaas</span><input name="apiKey" type="password" autoComplete="off" placeholder={keep ? '•••••••• (mantida)' : 'Cole a chave da sua conta'} className="field-input" /></label>
          ) : (
            <label><span className="field-label">Access Token do Mercado Pago</span><input name="accessToken" type="password" autoComplete="off" placeholder={keep ? '•••••••• (mantido)' : 'TEST-… (credencial de teste)'} className="field-input" /></label>
          )}
          {provider === 'mercadopago' && <label className="sm:col-span-2"><span className="field-label">Assinatura secreta do webhook</span><input name="webhookSecret" type="password" autoComplete="off" placeholder={keep ? '•••••••• (mantida)' : 'Painel do Mercado Pago › Webhooks › Assinatura secreta'} className="field-input" /></label>}
        </div>
      )}
      <div className="rounded-lg bg-ink-50 p-3 text-[0.78rem] text-ink-600">
        {infinite
          ? <p>Não precisa cadastrar nada na InfinitePay: o aviso de pagamento é configurado sozinho em cada pedido, neste endereço. A InfinitePay não tem modo de teste; o <strong>Testar conexão</strong> cria um link de R$ 1,00 na sua conta, e ninguém é cobrado.</p>
          : provider === 'asaas'
            ? <p>No Asaas, cadastre o webhook com a URL abaixo, eventos de cobrança (<code>PAYMENT_*</code>) e o token gerado aqui.</p>
            : <p>No painel do Mercado Pago (Suas integrações › Webhooks), cadastre a URL abaixo com o evento <strong>Pagamentos</strong> e copie a assinatura secreta para o campo acima. As notificações sem assinatura válida são recusadas.</p>}
        <p className="mt-1 break-all font-mono text-[0.74rem] text-ink-800" data-testid="webhook-url">{webhookUrls[provider]}</p>
        {provider === 'asaas' && keep && <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="regenerate" className="h-4 w-4" />Gerar novo token do webhook</label>}
      </div>
      {state?.webhookToken && <p className="rounded-lg border border-warn/40 bg-warn-bg p-3 text-[0.8rem] text-ink-800" data-testid="webhook-token">Token do webhook (copie agora, ele não será exibido de novo): <code className="break-all font-mono">{state.webhookToken}</code></p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar pagamento online'}</button>
        {configured && provider === initialProvider && <button type="button" onClick={runTest} disabled={testing || pending} className="min-h-11 rounded-xl border border-ink-200 px-5 text-sm font-bold text-ink-800 hover:bg-ink-50 disabled:opacity-60">{testing ? 'Testando…' : 'Testar conexão'}</button>}
        {state && <p role="status" className={`text-[0.8rem] ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>}
        {test && <p role="status" data-testid="online-payment-test" className={`text-[0.8rem] ${test.ok ? 'text-success' : 'text-danger'}`}>{test.message}</p>}
      </div>
    </form>
  );
}
