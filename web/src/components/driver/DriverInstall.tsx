'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Smartphone } from 'lucide-react';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
export function DriverInstall({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const update = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    update(); standalone.addEventListener('change', update);
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', complete);
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/driver-sw.js', { scope: '/entregador' }).catch(() => setStatus('Use o menu do navegador para adicionar à tela inicial.'));
    return () => { standalone.removeEventListener('change', update); window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', complete); };
  }, []);
  async function install() {
    if (!prompt) return;
    try { await prompt.prompt(); const choice = await prompt.userChoice; setStatus(choice.outcome === 'accepted' ? 'Instalação solicitada ao navegador.' : 'Você pode instalar depois pelo menu do navegador.'); }
    catch { setStatus('Abra o menu do navegador e escolha adicionar à tela inicial.'); }
    setPrompt(null);
  }
  return <section className="rounded-xl border border-ink-200 bg-white p-4">
    <div className="flex items-center gap-2 font-semibold text-ink-900"><Smartphone size={20} aria-hidden="true" /> App do entregador</div>
    <p className="mt-2 text-sm text-ink-500">{installed ? 'O app está aberto no modo instalado.' : 'Abra as entregas diretamente pela tela inicial do celular.'}</p>
    {!installed && prompt && <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-white" onClick={install}><Download size={18} aria-hidden="true" /> Instalar app</button>}
    {compact ? <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand" href="/entregador/instalar">Ver instalação e compartilhar acesso</Link> : <>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-ink-700">
        <li><strong>Android (Chrome):</strong> abra este endereço no Chrome. Use “Instalar app” quando disponível ou o menu ⋮ → Adicionar à tela inicial / Instalar aplicativo.</li>
        <li><strong>iPhone (Safari):</strong> abra este endereço no Safari, toque em Compartilhar → Adicionar à Tela de Início → Adicionar.</li>
        <li><strong>Desktop (Chrome ou Edge):</strong> use o ícone de instalação na barra de endereço ou a opção “Instalar aplicativo” do navegador, quando disponível.</li>
        <li>Abra o ícone e entre com o acesso de entregador fornecido pelo estabelecimento. A instalação não concede acesso nem salva sua senha automaticamente.</li>
      </ol>
      <p className="mt-4 text-sm text-ink-500">É necessária conexão para consultar ou atualizar entregas. Não há envio de operações offline, notificações push ou rastreamento automático em segundo plano.</p>
      <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand" href="/entregador">Abrir área do entregador</Link>
    </>}
    {status && <p role="status" className="mt-3 text-sm text-ink-600">{status}</p>}
  </section>;
}
