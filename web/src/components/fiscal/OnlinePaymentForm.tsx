'use client';

import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOnlinePaymentAction, testOnlinePaymentAction } from '@/app/actions/fiscal';

type Provider = 'infinitepay' | 'mercadopago';

const PROVIDER_NAME: Record<Provider, string> = { infinitepay: 'InfinitePay', mercadopago: 'Mercado Pago' };

export function OnlinePaymentForm({ enabled, environment, provider: initialProvider, configured, usable, verified, handle, infiniteKeySaved, webhookUrls }: { enabled: boolean; environment: 'sandbox' | 'production'; provider: Provider; configured: boolean; usable: boolean; verified: boolean; handle?: string; infiniteKeySaved?: boolean; webhookUrls: Record<Provider, string> }) {
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
      <fieldset className="grid gap-2 sm:grid-cols-2" aria-label="Provedor de pagamento">
        {(['infinitepay', 'mercadopago'] as const).map((p) => (
          <label key={p} className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold ${provider === p ? 'border-brand bg-brand-light text-brand' : 'border-ink-200 text-ink-700'}`}>
            <input type="radio" name="provider" value={p} checked={provider === p} onChange={() => setProvider(p)} className="accent-[var(--brand)]" />
            {PROVIDER_NAME[p]}
          </label>
        ))}
      </fieldset>
      {infinite ? (
        <div className="space-y-1 text-[0.8rem] text-ink-500">
          <p>Usa a conta InfinitePay da própria loja: o dinheiro cai direto nela. No checkout, o cliente é levado à página segura da InfinitePay, paga no <strong>Pix ou no cartão de crédito</strong> e volta para o acompanhamento do pedido.</p>
          <p>O pedido só fica <strong>Pago</strong>, e só pode ser liberado para entrega, depois que o Del Flash confere o pagamento direto na InfinitePay.</p>
        </div>
      ) : (
        <p className="text-[0.8rem] text-ink-500">Usa a conta {name} da própria loja. O cliente paga no Pix (QR ou copia e cola) ou no cartão pela página segura do {name}; nenhum dado de cartão passa pelo Del Flash. O pedido só fica <strong>Pago</strong> quando o {name} confirma pelo webhook.</p>
      )}
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-[var(--brand)]" />Oferecer pagamento online no checkout</label>
      {infinite ? (
        <div className="space-y-3"><label className="block"><span className="field-label">InfiniteTag da loja</span>
          <input name="handle" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={keep && handle ? `${handle} (mantida)` : 'Ex.: minhaadega'} className="field-input !border-red-400" data-testid="infinitepay-handle" />
          <span className="mt-1 block text-[0.74rem] text-ink-500">No app da InfinitePay, toque no seu perfil: é o nome que aparece com $ na frente. O Del Flash aceita a tag com ou sem o $.</span>
        </label>
        <label className="block"><span className="field-label">API Key da própria loja (opcional)</span>
          <input name="infinitePayApiKey" type="password" autoComplete="new-password" maxLength={256} placeholder={infiniteKeySaved ? 'Deixe vazio para manter a chave salva' : 'inchk_…'} className="field-input" />
          <span className="mt-1 block text-xs text-ink-600">Com a chave, cada link aceita um único pagamento e vence em 45 minutos.</span>
        </label>
        <details className="rounded-lg border border-red-200 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Passo a passo da InfinitePay com imagens</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Entre na conta InfinitePay da sua loja e copie a InfiniteTag exibida no Perfil.</li>
            <li>Em Configurações do Checkout, ative Habilitar checkout integrado. Se quiser links de uso único, crie uma API Key nessa tela.</li>
            <li>Preencha os campos acima, salve e clique em Testar conexão.</li>
          </ol>
          <div className="mt-3 grid gap-3">
            <figure>
              <figcaption className="mb-1 font-medium">1. Copie a InfiniteTag no perfil da conta da loja</figcaption>
              <img src="/guides/infinitepay-infinitetag.webp" alt="Documentação oficial com destaque em vermelho para o local da InfiniteTag na Conta Web ou no app." width={780} height={162} loading="lazy" className="h-auto w-full max-w-full rounded-lg" />
            </figure>
            <figure>
              <figcaption className="mb-1 font-medium">2. Abra Configurações do Checkout para criar a chave opcional</figcaption>
              <img src="/guides/infinitepay-api-key.webp" alt="Documentação oficial com destaque em vermelho para Configurações do Checkout, ativação e criação da API Key." width={789} height={191} loading="lazy" className="h-auto w-full max-w-full rounded-lg" />
            </figure>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <a href="https://app.infinitepay.io/" target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Abrir InfinitePay</a>
            <a href="https://www.infinitepay.io/checkout-documentacao#faq" target="_blank" rel="noreferrer" className="font-semibold text-brand underline">Ver guia oficial</a>
          </div>
        </details>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <details className="rounded-lg border border-ink-200 p-3 text-sm sm:col-span-2">
            <summary className="cursor-pointer font-semibold">Configurar e testar o Mercado Pago</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Abra Suas integrações no Mercado Pago e selecione o aplicativo Checkout Pro da loja.</li>
              <li>Copie o Access Token de teste e configure a URL do webhook para o evento Pagamentos.</li>
              <li>Cole o token e a assinatura secreta abaixo. Salve no ambiente de teste e clique em Testar conexão.</li>
              <li>Para simular uma compra, use uma conta de comprador e um cartão de teste do Mercado Pago.</li>
            </ol>
            <a href="https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-purchase" target="_blank" rel="noreferrer" className="mt-3 inline-block font-semibold text-brand underline">Instruções oficiais da compra de teste</a>
          </details>
          <label><span className="field-label">Ambiente</span>
            <select name="environment" defaultValue={initialProvider === 'mercadopago' ? environment : 'sandbox'} className="field-input">
              <option value="sandbox">Teste (sandbox)</option>
              <option value="production">Produção (exige homologação)</option>
            </select>
          </label>
          <label><span className="field-label">Access Token do Mercado Pago</span><input name="accessToken" type="password" autoComplete="off" placeholder={keep ? '•••••••• (mantido)' : 'TEST-… (credencial de teste)'} className="field-input" /></label>
          {provider === 'mercadopago' && <label className="sm:col-span-2"><span className="field-label">Assinatura secreta do webhook</span><input name="webhookSecret" type="password" autoComplete="off" placeholder={keep ? '•••••••• (mantida)' : 'Painel do Mercado Pago › Webhooks › Assinatura secreta'} className="field-input" /></label>}
        </div>
      )}
      <div className="rounded-lg bg-ink-50 p-3 text-[0.78rem] text-ink-600">
        {infinite
          ? <p>Após ativar o Checkout Integrado na sua conta InfinitePay, o aviso de pagamento é configurado sozinho em cada pedido, neste endereço. A InfinitePay não tem modo de teste; o <strong>Testar conexão</strong> cria um link de R$ 1,00 na sua conta, e ninguém é cobrado.</p>
          : <p>No painel do Mercado Pago (Suas integrações › Webhooks), cadastre a URL abaixo com o evento <strong>Pagamentos</strong> e copie a assinatura secreta para o campo acima. As notificações sem assinatura válida são recusadas.</p>}
        <p className="mt-1 break-all font-mono text-[0.74rem] text-ink-800" data-testid="webhook-url">{webhookUrls[provider]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-60">{pending ? 'Salvando…' : 'Salvar pagamento online'}</button>
        {configured && provider === initialProvider && <button type="button" onClick={runTest} disabled={testing || pending} className="min-h-11 rounded-xl border border-ink-200 px-5 text-sm font-bold text-ink-800 hover:bg-ink-50 disabled:opacity-60">{testing ? 'Testando…' : 'Testar conexão'}</button>}
        {state && <p role="status" className={`text-[0.8rem] ${state.ok ? 'text-success' : 'text-danger'}`}>{state.message}</p>}
        {test && <p role="status" data-testid="online-payment-test" className={`text-[0.8rem] ${test.ok ? 'text-success' : 'text-danger'}`}>{test.message}</p>}
      </div>
    </form>
  );
}
