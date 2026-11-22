'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkWhatsAppConnectionAction, disconnectWhatsAppAction, finishWhatsAppConnectionAction, startWhatsAppConnectionAction } from '@/app/actions/whatsapp-connection';
import { readSignupMessage } from '@/lib/assistant/meta-connect';
import { Alert, Button } from '@/components/ui';

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>) => void;
};
declare global { interface Window { FB?: FacebookSdk } }

function loadFacebookSdk(): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    script.async = true;
    const finish = (sdk?: FacebookSdk) => {
      window.clearTimeout(timer);
      if (sdk) resolve(sdk);
      else { script.remove(); reject(new Error('sdk')); }
    };
    const timer = window.setTimeout(() => finish(), 15000);
    script.onload = () => finish(window.FB);
    script.onerror = () => finish();
    document.head.appendChild(script);
  });
}

type Prepared = { sdk: FacebookSdk; configId: string };
type ActionResult = { ok: true; message: string } | { ok: false; error: string };
const facebookOrigins = new Set(['https://www.facebook.com', 'https://web.facebook.com']);

export function WhatsAppConnect({ connected, registered }: { connected: boolean; registered: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [pin, setPin] = useState('');
  const [missing, setMissing] = useState<Array<{ key: string; label: string }>>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const busy = pending || waiting;

  useEffect(() => () => cleanup.current?.(), []);

  function prepare() {
    setResult(null);
    setMissing([]);
    start(async () => {
      const setup = await startWhatsAppConnectionAction().catch(() => null);
      if (!setup) return setResult({ ok: false, text: 'Sem resposta do servidor. Tente novamente.' });
      if (!setup.ok) return setResult({ ok: false, text: setup.error });
      if (!setup.ready) {
        setMissing(setup.pending);
        return setResult({ ok: false, text: 'A plataforma ainda precisa concluir a configuração no painel da Meta.' });
      }
      try {
        const sdk = await loadFacebookSdk();
        sdk.init({ appId: setup.appId, autoLogAppEvents: false, xfbml: false, version: setup.version });
        setPrepared({ sdk, configId: setup.configId });
      } catch {
        setResult({ ok: false, text: 'Não foi possível carregar a Meta. Confira o bloqueador de conteúdo e tente de novo.' });
      }
    });
  }

  function openMeta() {
    if (!prepared || !/^\d{6}$/.test(pin)) return;
    setResult(null);
    cleanup.current?.();
    let signup: { phoneNumberId: string; wabaId: string } | null = null;
    let code: string | null = null;
    let settled = false;
    const stop = () => {
      settled = true;
      window.removeEventListener('message', listener);
      window.clearTimeout(timer);
      cleanup.current = null;
    };
    const fail = (text: string) => {
      if (settled) return;
      stop();
      setWaiting(false);
      setResult({ ok: false, text });
    };
    const finish = () => {
      if (settled || !signup || !code) return;
      const input = { code, ...signup, pin };
      stop();
      setPin('');
      start(async () => {
        const done = await finishWhatsAppConnectionAction(input).catch(() => null);
        setWaiting(false);
        setResult(done?.ok ? { ok: true, text: done.message } : { ok: false, text: done?.error ?? 'Sem resposta. Confira o status antes de tentar de novo.' });
        router.refresh();
      });
    };
    const listener = (event: MessageEvent) => {
      if (!facebookOrigins.has(event.origin)) return;
      const message = readSignupMessage(event.data);
      if (!message) return;
      if (message.event === 'FINISH') {
        signup = message;
        finish();
      } else {
        fail(message.event === 'CANCEL' ? 'Conexão cancelada na janela da Meta.' : message.detail);
      }
    };
    const timer = window.setTimeout(() => fail('A janela da Meta não concluiu a conexão. Confira se o navegador permitiu a abertura e tente de novo.'), 5 * 60 * 1000);
    window.addEventListener('message', listener);
    cleanup.current = stop;
    setWaiting(true);
    // O SDK abre a janela no próprio clique, necessário em navegadores móveis.
    try {
      prepared.sdk.login((response) => {
        code = response.authResponse?.code ?? null;
        if (code) finish();
        else fail('A autorização não foi concluída na janela da Meta.');
      }, { config_id: prepared.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: '', sessionInfoVersion: '3' } });
    } catch {
      fail('O navegador não abriu a janela da Meta. Permita pop-ups e tente de novo.');
    }
  }

  function run(action: () => Promise<ActionResult>) {
    setResult(null);
    start(async () => {
      const done = await action().catch(() => null);
      setResult(done?.ok ? { ok: true, text: done.message } : { ok: false, text: done?.error ?? 'Sem resposta do servidor. Tente novamente.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-testid="whatsapp-connect">
      {!connected && prepared && (
        <label className="block max-w-xs">
          <span className="field-label">PIN de verificação em duas etapas da Meta</span>
          <input type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="new-password" disabled={busy} className="field-input" />
          <span className="mt-1 block text-xs text-ink-600">Use o PIN de seis dígitos do número ou defina um para o primeiro registro. O Del Flash não guarda esse PIN.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!connected && !prepared && <Button onClick={prepare} loading={busy}>Conectar WhatsApp oficial</Button>}
        {!connected && prepared && <Button onClick={openMeta} loading={busy} disabled={pin.length !== 6}>Abrir janela da Meta</Button>}
        {waiting && !pending && <Button variant="ghost" onClick={() => { cleanup.current?.(); setWaiting(false); }}>Cancelar conexão</Button>}
        {registered && <Button variant="secondary" onClick={() => run(checkWhatsAppConnectionAction)} loading={pending} disabled={waiting}>Verificar conexão</Button>}
        {registered && <Button variant="ghost" onClick={() => run(disconnectWhatsAppAction)} disabled={busy}>Desconectar</Button>}
      </div>
      {result && <Alert tone={result.ok ? 'success' : 'danger'}>{result.text}</Alert>}
      {missing.length > 0 && <ul className="space-y-1 rounded-lg border border-ink-100 p-3 text-sm text-ink-700">{missing.map((item) => <li key={item.key}>{item.label}</li>)}</ul>}
    </div>
  );
}
