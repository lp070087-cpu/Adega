'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone } from 'lucide-react';
import { observeInstalledContext } from '@/lib/pwa-install-state';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

export function detectInstallPlatform(ua: string, touchMac = false): Platform {
  const ios = /iphone|ipad|ipod/i.test(ua) || touchMac;
  if (ios) return /crios|fxios|edgios|opios/i.test(ua) ? 'ios-other' : 'ios-safari';
  return /android/i.test(ua) ? 'android' : 'desktop';
}

type Listener = (event: InstallEvent | null) => void;
let deferredPrompt: InstallEvent | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener(deferredPrompt));

/**
 * Mounted once for every /entregador page (layout): registers the service
 * worker (required for Android to offer installation) and keeps the browser's
 * one-time install prompt so the Conta tab can use it whenever it is opened.
 */
export function DriverPwaBootstrap() {
  useEffect(() => {
    // The store panel has its own installable app; only the driver area takes over the prompt.
    if (!/^\/entregador(?:\/|$)/.test(window.location.pathname)) return;
    const before = (event: Event) => { event.preventDefault(); deferredPrompt = event as InstallEvent; emit(); };
    const installed = () => { deferredPrompt = null; emit(); };
    window.addEventListener('beforeinstallprompt', before);
    window.addEventListener('appinstalled', installed);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void (async () => {
        const legacyScope = new URL('/entregador', window.location.origin).href;
        const script = new URL('/driver-sw.js', window.location.origin).href;
        for (const registration of await navigator.serviceWorker.getRegistrations()) {
          const registered = registration.active ?? registration.waiting ?? registration.installing;
          if (registration.scope === legacyScope && registered?.scriptURL === script) await registration.unregister();
        }
        await navigator.serviceWorker.register('/driver-sw.js', { scope: '/entregador/', updateViaCache: 'none' });
      })().catch(() => undefined);
    }
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', installed); };
  }, []);
  return null;
}

/**
 * "Instalar Del Flash Entregador" (Conta tab). Optional: the app works in the
 * browser too. The button always does something real — the browser's native
 * prompt when it offered one, otherwise the steps for this browser.
 */
export function DriverInstallCard() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [showSteps, setShowSteps] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const stopObserving = observeInstalledContext(window, navigator, setInstalled);
    const listener: Listener = (event) => setPrompt(event);
    listeners.add(listener);
    setPrompt(deferredPrompt);
    return () => { stopObserving(); listeners.delete(listener); };
  }, []);

  async function install() {
    if (!prompt) { setShowSteps(true); return; }
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setStatus(choice.outcome === 'accepted' ? 'Instalando… o ícone aparecerá na tela inicial.' : 'Tudo bem. Você pode instalar depois por aqui.');
    } catch { setShowSteps(true); }
    deferredPrompt = null;
    emit();
  }

  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4" aria-labelledby="driver-install-title" data-testid="driver-install">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">{installed ? <CheckCircle2 size={22} aria-hidden /> : <Smartphone size={22} aria-hidden />}</span>
        <div className="min-w-0">
          <h3 id="driver-install-title" className="font-bold text-ink-900">{installed ? 'Aplicativo instalado' : 'Instalar Del Flash Entregador'}</h3>
          <p className="mt-0.5 text-sm text-ink-500">{installed ? 'Você está usando o app pela tela inicial do celular.' : 'Adicione o aplicativo à tela inicial do seu celular para acessar suas entregas com mais facilidade.'}</p>
        </div>
      </div>
      {!installed && <>
        <button type="button" onClick={install} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white" aria-expanded={!prompt ? showSteps : undefined}>
          <Download size={18} aria-hidden />Instalar aplicativo
        </button>
        {showSteps && <InstallSteps platform={platform} />}
        <p className="mt-3 text-xs text-ink-500">Opcional: você também pode trabalhar normalmente pelo navegador.</p>
      </>}
      {status && <p role="status" className="mt-3 text-sm text-ink-600">{status}</p>}
    </section>
  );
}

function InstallSteps({ platform }: { platform: Platform }) {
  const steps = platform === 'ios-safari' || platform === 'ios-other'
    ? [
        platform === 'ios-other' ? 'Abra este endereço no Safari (o iPhone só instala apps pelo Safari).' : 'Confirme que está no Safari.',
        <>Toque em <strong>Compartilhar</strong> <Share size={14} className="inline align-[-2px]" aria-label="ícone de compartilhar" /> na barra do navegador.</>,
        <>Selecione <strong>Adicionar à Tela de Início</strong>.</>,
        <>Toque em <strong>Adicionar</strong> para confirmar.</>,
      ]
    : platform === 'android'
      ? [<>Toque no menu <strong>⋮</strong> do navegador (Chrome, Edge ou Samsung Internet).</>, <>Escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</>, <>Confirme em <strong>Instalar</strong>.</>]
      : [<>Use o ícone de instalação na barra de endereço do Chrome ou Edge.</>, <>Ou abra o menu do navegador e escolha <strong>Instalar Del Flash Entregador</strong>.</>];
  return (
    <div className="mt-4 rounded-xl bg-ink-50 p-4" role="region" aria-label="Como instalar">
      <p className="mb-3 text-sm font-semibold text-ink-800">{platform.startsWith('ios') ? 'No iPhone:' : platform === 'android' ? 'No Android:' : 'No computador:'}</p>
      <ol className="driver-install-steps">{steps.map((step, i) => <li key={i}><span>{step}</span></li>)}</ol>
    </div>
  );
}
