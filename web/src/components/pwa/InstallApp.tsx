'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp({ worker, scope, name }: { worker: string; scope: string; name: string }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // A prompt captured for one shop must not survive navigation to another.
    setInstallEvent(null);
    setInstructions(false);
    setStatus('');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const update = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const before = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const complete = () => { setInstalled(true); setInstallEvent(null); };
    update(); standalone.addEventListener('change', update);
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', complete);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(worker, { scope, updateViaCache: 'none' })
        .then(registration => registration.update()).catch(() => setStatus('Use o menu do navegador para adicionar à tela inicial.'));
    }
    return () => {
      standalone.removeEventListener('change', update);
      window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', complete);
    };
  }, [worker, scope]);

  async function install() {
    setInstructions(true);
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const result = await installEvent.userChoice;
      setStatus(result.outcome === 'accepted' ? 'Instalação solicitada ao navegador.' : 'Você pode instalar depois pelo menu do navegador.');
    } catch { setStatus('Abra o menu do navegador para instalar.'); }
    setInstallEvent(null);
  }

  if (installed) return null;
  return <section className="my-3 min-w-0 rounded-xl bg-white p-3 text-ink-900 sm:p-4" aria-label={`Aplicativo ${name}`}>
    <button type="button" onClick={install} className="inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold">
      <Download size={18} className="shrink-0" aria-hidden="true" /> <span>Instalar aplicativo</span>
    </button>
    {instructions && <div className="mt-3 max-w-xl text-sm leading-relaxed">
      <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{name} na tela inicial</h2><button type="button" aria-label="Fechar instruções de instalação" onClick={() => setInstructions(false)} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg"><X size={18} /></button></div>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Android:</strong> no Chrome, use “Instalar aplicativo” ou o menu → Adicionar à tela inicial.</li>
        <li><strong>iPhone/iPad:</strong> no Safari, toque em Compartilhar → Adicionar à Tela de Início.</li>
        <li><strong>Desktop:</strong> no Chrome ou Edge, use o ícone de instalação da barra de endereço, quando disponível.</li>
      </ul>
      <p className="mt-3 text-ink-500">É necessária conexão para consultar dados e enviar operações. A instalação não concede acesso. As atualizações são verificadas ao abrir o aplicativo; não há envio automático de operações offline.</p>
    </div>}
    {status && <p role="status" className="mt-2 text-sm text-ink-500">{status}</p>}
  </section>;
}
