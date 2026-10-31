'use client';

import { useRef, useState, useTransition } from 'react';
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
    script.onload = () => (window.FB ? resolve(window.FB) : reject(new Error('sdk')));
    script.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(script);
  });
}

const fromFacebook = (origin: string) => /^https:\/\/([a-z0-9-]+\.)?facebook\.com$/.test(origin);

/**
 * Conexão pelo Embedded Signup da Meta: a loja faz login na Meta, escolhe o
 * número e o servidor confirma tudo com a própria Meta antes de gravar. A tela
 * só muda de estado depois disso, relendo o que o servidor tem.
 */
export function WhatsAppConnect({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(false);
  const [missing, setMissing] = useState<Array<{ key: string; label: string }>>([]);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const listener = useRef<((event: MessageEvent) => void) | null>(null);
  const busy = pending || waiting;

  function stopListening() {
    if (listener.current) window.removeEventListener('message', listener.current);
    listener.current = null;
  }

  function connect() {
    setResult(null);
    setMissing([]);
    start(async () => {
      const prepared = await startWhatsAppConnectionAction().catch(() => null);
      if (!prepared) return setResult({ ok: false, text: 'Sem resposta do servidor. Tente novamente.' });
      if (!prepared.ok) return setResult({ ok: false, text: prepared.error });
      if (!prepared.ready) {
        setMissing(prepared.pending);
        return setResult({ ok: false, text: 'A conexão ainda não pode começar: a plataforma precisa concluir os itens abaixo.' });
      }
      let sdk: FacebookSdk;
      try { sdk = await loadFacebookSdk(); } catch { return setResult({ ok: false, text: 'Não foi possível abrir a Meta. Desative bloqueadores nesta página e tente novamente.' }); }
      sdk.init({ appId: prepared.appId, autoLogAppEvents: true, xfbml: false, version: prepared.version });

      let signup: { phoneNumberId: string; wabaId: string } | null = null;
      let code: string | null = null;
      const finish = () => {
        if (!signup || !code) return;
        const input = { code, ...signup };
        stopListening();
        start(async () => {
          const done = await finishWhatsAppConnectionAction(input).catch(() => null);
          setWaiting(false);
          setResult(done?.ok ? { ok: true, text: done.message } : { ok: false, text: done ? done.error : 'Sem resposta do servidor. Confira o status antes de tentar de novo.' });
          router.refresh();
        });
      };
      stopListening();
      listener.current = (event) => {
        if (!fromFacebook(event.origin)) return;
        const message = readSignupMessage(event.data);
        if (!message) return;
        if (message.event === 'FINISH') { signup = message; finish(); return; }
        stopListening();
        setWaiting(false);
        setResult({ ok: false, text: message.event === 'CANCEL' ? 'Conexão cancelada na janela da Meta.' : message.detail });
      };
      window.addEventListener('message', listener.current);
      setWaiting(true);
      sdk.login((response) => {
        code = response.authResponse?.code ?? null;
        if (code) { finish(); return; }
        stopListening();
        setWaiting(false);
        setResult({ ok: false, text: 'A autorização não foi concluída na janela da Meta.' });
      }, { config_id: prepared.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: '', sessionInfoVersion: '3' } });
    });
  }

  function run(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setResult(null);
    start(async () => {
      const done = await action().catch(() => null);
      setResult(done?.ok ? { ok: true, text: done.message } : { ok: false, text: done ? done.error : 'Sem resposta do servidor. Tente novamente.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-testid="whatsapp-connect">
      <div className="flex flex-wrap gap-2">
        {!connected && <Button onClick={connect} loading={busy}>Conectar WhatsApp oficial</Button>}
        {connected && <Button variant="secondary" onClick={() => run(checkWhatsAppConnectionAction)} loading={pending}>Verificar conexão</Button>}
        {connected && <Button variant="ghost" onClick={() => run(disconnectWhatsAppAction)} disabled={pending}>Desconectar</Button>}
      </div>
      {result && <Alert tone={result.ok ? 'success' : 'danger'}>{result.text}</Alert>}
      {missing.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-ink-100 p-3 text-[0.8rem] text-ink-700" data-testid="whatsapp-pending">
          {missing.map((item) => <li key={item.key}>✗ {item.label} <code className="text-[0.72rem] text-ink-500">{item.key}</code></li>)}
        </ul>
      )}
    </div>
  );
}
