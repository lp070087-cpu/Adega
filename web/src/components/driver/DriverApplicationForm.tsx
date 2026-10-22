'use client';
import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { registerDriverApplicationAction, joinDriverStoreAction, confirmDriverApplicationAction } from '@/app/actions/driver-applications';
import { DriverLoginForm } from './DriverLoginForm';

/** Sign in or create an account from the store's single driver link. */
export function DriverStoreAccess({ number, storeName, mailReady }: { number: string; storeName: string; mailReady: boolean }) {
  const [mode, setMode] = useState<'login' | 'create'>('login');
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Acesso do entregador" className="driver-link-tabs">
        <button role="tab" type="button" aria-selected={mode === 'login'} onClick={() => setMode('login')}>Entrar</button>
        <button role="tab" type="button" aria-selected={mode === 'create'} onClick={() => setMode('create')}>Criar conta</button>
      </div>
      {mode === 'login' ? (
        <div role="tabpanel">
          <p className="text-sm text-ink-600">Já entrega por outra loja ou já criou sua conta? Entre com seu e-mail e senha para solicitar o vínculo com a {storeName}.</p>
          <DriverLoginForm storeNumber={number} />
        </div>
      ) : (
        <div role="tabpanel"><DriverRegistrationForm number={number} storeName={storeName} mailReady={mailReady} /></div>
      )}
    </div>
  );
}

function DriverRegistrationForm({ number, storeName, mailReady }: { number: string; storeName: string; mailReady: boolean }) {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      setMessage(null);
      start(async () => {
        const result = await registerDriverApplicationAction({ number, data });
        if (result && 'error' in result) setMessage({ ok: false, text: String(result.error) });
        else if (result && 'verify' in result) setMessage({ ok: true, text: 'Enviamos um link para o seu e-mail. Confirme para concluir o cadastro; depois a loja analisará sua solicitação.' });
      });
    }}>
      <p className="text-sm text-ink-600">Crie sua conta de entregador. A {storeName} precisa aprovar seu cadastro antes de você receber entregas. Telefone e veículo podem ser informados depois.</p>
      <label className="driver-field">Nome<input required name="name" autoComplete="name" maxLength={80} placeholder="Seu nome" /></label>
      <label className="driver-field">E-mail<input required name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" maxLength={160} placeholder="voce@email.com" /></label>
      <label className="driver-field">Senha
        <span className="driver-password"><input required name="password" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} /><button type="button" aria-label={show ? 'Ocultar senhas' : 'Mostrar senhas'} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        <small className="text-xs font-normal text-ink-500">Mínimo de oito caracteres.</small>
      </label>
      <label className="driver-field">Confirme a senha<input required name="confirmPassword" type={show ? 'text' : 'password'} autoComplete="new-password" maxLength={72} /></label>
      {mailReady && <p className="text-xs text-ink-500">Você receberá um link para confirmar seu e-mail.</p>}
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'driver-link-status' : 'driver-link-error'} data-tone="info">{message.text}</p>}
      <button disabled={pending} className="driver-link-primary">{pending ? <><Loader2 size={18} className="animate-spin" aria-hidden />Criando conta…</> : 'Criar conta e solicitar vínculo'}</button>
    </form>
  );
}

/** Logged-in driver without a request for this store. */
export function DriverJoinStore({ number }: { number: string }) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-2">
      <button type="button" disabled={pending} className="driver-link-primary" onClick={() => start(async () => {
        const result = await joinDriverStoreAction(number);
        if ('error' in result) setMessage(String(result.error));
        else router.refresh();
      })}>{pending ? <><Loader2 size={18} className="animate-spin" aria-hidden />Enviando…</> : 'Solicitar vínculo com esta loja'}</button>
      {message && <p role="alert" className="driver-link-error">{message}</p>}
    </div>
  );
}

export function ConfirmDriverApplication() {
  const [credentials, setCredentials] = useState<{ number: string; token: string } | null>(null), [message, setMessage] = useState(''), [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => { const p = new URLSearchParams(location.hash.slice(1)); if (p.get('loja') && p.get('token')) setCredentials({ number: p.get('loja')!, token: p.get('token')! }); history.replaceState(null, '', location.pathname); }, []);
  return <div className="space-y-4"><h1 className="text-xl font-bold">Confirme seu e-mail</h1><p>O acesso às entregas depende da aprovação do estabelecimento.</p>{message && <p role="status">{message}</p>}<button disabled={!credentials || pending} className="driver-link-primary" onClick={() => start(async () => { const result = await confirmDriverApplicationAction(credentials!.number, credentials!.token); setMessage('error' in result ? String(result.error) : 'Solicitação enviada — aguardando aprovação da loja. Entre com o e-mail e a senha escolhida para acompanhar.'); if (!('error' in result)) { setCredentials(null); router.refresh(); } })}>Confirmar identidade e enviar solicitação</button><a className="driver-link-secondary" href="/entregador">Entrar no aplicativo</a></div>;
}
