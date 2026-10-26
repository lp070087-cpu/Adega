'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CircleMarker, LayerGroup, Map as LeafletMap, Marker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, X } from 'lucide-react';
import { driverNavigationAction } from '@/app/actions/drivers';

/**
 * Navegação dentro do app do entregador.
 *
 * • Mapa real (OpenStreetMap) com o destino e, com permissão, a posição atual.
 * • Rota pelas ruas, distância e tempo SÓ quando um serviço de roteamento
 *   real responde (ver src/lib/maps/routing.ts). Sem ele, nada de linha reta
 *   nem estimativa: mapa, destino e os botões do Google Maps e Waze.
 * • A posição é acompanhada só com esta tela aberta (o navegador não permite
 *   GPS em segundo plano) e não é gravada; serve para desenhar e pedir a rota.
 */

type Point = { latitude: number; longitude: number };
type Route = { available: true; coordinates: Array<[number, number]>; distanceMeters: number; durationSeconds: number; provider: string } | { available: false; reason: 'not_configured' | 'unavailable' };

const formatDistance = (meters: number) => (meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`);
const formatDuration = (seconds: number) => { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`; };
function metersBetween(a: Point, b: Point) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export function DriverNavigation({ orderId, address, reference, googleUrl, wazeUrl, useLocation = true, onClose }: { orderId: string; address: string; reference?: string | null; googleUrl: string; wazeUrl: string; useLocation?: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const layers = useRef<{ group?: LayerGroup; me?: CircleMarker; accuracy?: CircleMarker; destination?: Marker; route?: Polyline }>({});
  const lastRouteFrom = useRef<{ point: Point; at: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<(Point & { accuracy: number }) | null>(null);
  const [destination, setDestination] = useState<(Point & { approximate: boolean }) | null>(null);
  // O mapa aparece já no destino; sem destino em 2,5 s, mostra assim mesmo.
  const [shown, setShown] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [tilesFailing, setTilesFailing] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setShown(true), 2500); return () => window.clearTimeout(t); }, []);
  useEffect(() => { if (destination) setShown(true); }, [destination]);
  const [route, setRoute] = useState<Route | null>(null);
  const [status, setStatus] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>({ tone: 'info', text: 'Carregando o mapa…' });
  const [gps, setGps] = useState<'off' | 'waiting' | 'ok' | 'denied' | 'unavailable'>(useLocation ? 'waiting' : 'off');
  const [follow, setFollow] = useState(true);

  // Fecha com Esc e trava a rolagem do fundo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  // Mapa: criado uma vez, depois que o portal existe.
  useEffect(() => {
    if (!mounted) return;
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !box.current) return;
      leaflet.current = L;
      // Abre direto no destino quando ele já é conhecido (sem mostrar o Brasil inteiro).
      const instance = L.map(box.current, { center: destination ? [destination.latitude, destination.longitude] : [-14.235, -51.925], zoom: destination ? 16 : 4, zoomControl: true });
      let tileErrors = 0;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' })
        .on('tileerror', () => { tileErrors += 1; if (tileErrors >= 4) setTilesFailing(true); })
        .on('tileload', () => { tileErrors = 0; setTilesFailing(false); })
        .addTo(instance);
      instance.on('dragstart', () => setFollow(false));
      layers.current.group = L.layerGroup().addTo(instance);
      map.current = instance;
      // O portal acabou de montar: mede o contêiner de novo antes de enquadrar.
      requestAnimationFrame(() => instance.invalidateSize());
      setReady(true);
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(box.current);
      instance.once('unload', () => observer.disconnect());
    }).catch(() => { if (!disposed) { setMapFailed(true); setShown(true); } });
    return () => { disposed = true; map.current?.remove(); map.current = null; layers.current = {}; };
  }, [mounted]);

  const load = useCallback(async (from: Point | null) => {
    try {
      const result = await driverNavigationAction({ orderId, from });
      if (!result.ok) { setStatus({ tone: 'error', text: result.error }); return; }
      if (!result.destination) { setStatus({ tone: 'warn', text: 'Não foi possível localizar o endereço no mapa. Use o Google Maps ou o Waze.' }); return; }
      setDestination(result.destination);
      setRoute(result.route as Route);
      if (from) lastRouteFrom.current = { point: from, at: Date.now() };
      setStatus(null);
    } catch {
      setStatus({ tone: 'error', text: 'Sem conexão. O mapa volta a atualizar quando a internet voltar.' });
    }
  }, [orderId]);

  useEffect(() => { void load(null); }, [load]);

  // Posição do entregador: só com a opção ligada e esta tela aberta.
  useEffect(() => {
    if (!useLocation) { setGps('off'); return; }
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) { setGps('unavailable'); return; }
    const id = navigator.geolocation.watchPosition(
      (position) => { setGps('ok'); setMe({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); },
      (error) => setGps(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [useLocation]);

  // Pede nova rota ao andar ~150 m ou a cada 60 s (nunca mais de uma vez a cada 20 s).
  useEffect(() => {
    if (!me || !destination) return;
    const last = lastRouteFrom.current;
    const elapsed = last ? Date.now() - last.at : Infinity;
    if (!last || (elapsed > 20000 && (metersBetween(last.point, me) > 150 || elapsed > 60000))) void load({ latitude: me.latitude, longitude: me.longitude });
  }, [me, destination, load]);

  // Desenho: destino, posição, rota.
  useEffect(() => {
    const L = leaflet.current, instance = map.current, group = layers.current.group;
    if (!ready || !L || !instance || !group) return;
    if (destination) {
      const at: [number, number] = [destination.latitude, destination.longitude];
      if (!layers.current.destination) {
        layers.current.destination = L.marker(at, { icon: L.divIcon({ className: 'df-store-pin df-destination-pin', html: '<span aria-hidden="true"></span>', iconSize: [34, 44], iconAnchor: [17, 42] }), title: 'Destino da entrega', alt: 'Destino da entrega' }).addTo(group);
        instance.setView(at, 16, { animate: false });
      } else layers.current.destination.setLatLng(at);
    }
    if (me) {
      const at: [number, number] = [me.latitude, me.longitude];
      // Sem destino localizado, o mapa abre na posição do entregador (e não no Brasil inteiro).
      if (!destination && !layers.current.me) instance.setView(at, 15, { animate: false });
      if (!layers.current.me) layers.current.me = L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#087ea4', fillOpacity: 1 }).addTo(group);
      else layers.current.me.setLatLng(at);
    }
    layers.current.route?.remove();
    layers.current.route = undefined;
    if (route?.available) layers.current.route = L.polyline(route.coordinates, { color: '#087ea4', weight: 5, opacity: 0.85 }).addTo(group);
  }, [ready, destination, me, route]);

  // Enquadra loja→cliente uma vez; depois segue o entregador se ele não mexeu no mapa.
  const framed = useRef(false);
  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance || !me) return;
    if (!framed.current && destination) {
      instance.fitBounds(L.latLngBounds([[me.latitude, me.longitude], [destination.latitude, destination.longitude]]), { padding: [48, 48], maxZoom: 17 });
      framed.current = true;
    } else if (follow && framed.current) instance.panTo([me.latitude, me.longitude], { animate: true });
  }, [ready, me, destination, follow]);

  // Sem posição (localização desligada): enquadra o trajeto loja → cliente.
  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance || me || framed.current || !route?.available) return;
    instance.fitBounds(L.latLngBounds(route.coordinates), { padding: [48, 48], maxZoom: 17 });
    framed.current = true;
  }, [ready, me, route]);

  function center() {
    setFollow(true);
    if (me) map.current?.setView([me.latitude, me.longitude], Math.max(map.current.getZoom(), 16));
    else if (destination) map.current?.setView([destination.latitude, destination.longitude], 16);
  }

  const gpsText = gps === 'off'
    ? 'Localização desligada: o trajeto parte da loja. Para ver sua posição, ative "Usar minha localização para navegação" em Ajustes.'
    : gps === 'denied'
    ? 'Localização negada. Para ver sua posição, permita a localização para este site nas configurações do navegador.'
    : gps === 'unavailable' ? 'GPS indisponível neste aparelho ou conexão. O destino continua no mapa.'
    : gps === 'waiting' ? 'Procurando sua localização…' : null;

  if (!mounted) return null;

  // Portal no body: a folha do pedido tem animação (transform), que prenderia o `fixed`.
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Navegação até o cliente" data-testid="driver-navigation">
      <header className="flex items-start gap-3 border-b border-ink-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">Destino</p>
          <p className="break-words text-[0.9rem] font-semibold text-ink-900">{address || 'Endereço não informado'}</p>
          {reference && <p className="mt-0.5 break-words text-[0.76rem] text-ink-500">Referência: {reference}</p>}
          {destination?.approximate && <p className="mt-0.5 text-[0.72rem] font-semibold text-amber-700">Posição aproximada pelo endereço.</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar navegação" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-700"><X size={20} aria-hidden /></button>
      </header>

      <div className="relative isolate min-h-0 flex-1 bg-ink-50">
        <div ref={box} className={`df-map absolute inset-0 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`} aria-label="Mapa da rota" />
        {!shown && <p className="absolute inset-0 flex items-center justify-center text-[0.8rem] text-ink-500">Carregando o mapa…</p>}
        {mapFailed && <p className="absolute inset-x-3 top-3 z-[600] rounded-md bg-white px-3 py-2 text-center text-[0.78rem] font-semibold text-ink-800 shadow" role="alert" data-testid="navigation-map-error">O mapa não carregou. Use os botões do Google Maps ou do Waze abaixo para navegar.</p>}
        {tilesFailing && !mapFailed && <p className="absolute inset-x-3 top-3 z-[600] rounded-md bg-amber-50 px-3 py-2 text-center text-[0.74rem] text-amber-900 shadow" role="status">As ruas do mapa não carregaram agora. O destino e a navegação externa continuam disponíveis.</p>}
        <button type="button" onClick={center} aria-label="Centralizar na minha localização" className="absolute bottom-4 right-4 z-[500] flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand shadow-lg"><Crosshair size={22} aria-hidden /></button>
        {status && <p role={status.tone === 'error' ? 'alert' : 'status'} className={`absolute inset-x-3 top-3 z-[500] rounded-lg px-3 py-2 text-center text-[0.78rem] shadow ${status.tone === 'error' ? 'bg-danger-bg text-danger' : status.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-white/95 text-ink-700'}`}>{status.text}</p>}
      </div>

      <footer className="space-y-2.5 border-t border-ink-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {route?.available ? (
          <p className="text-[0.95rem] font-bold text-ink-900" data-testid="route-summary">{formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)} <span className="text-[0.72rem] font-normal text-ink-500">pelas ruas ({route.provider})</span></p>
        ) : (
          <p className="text-[0.78rem] text-ink-600" data-testid="route-missing">
            {route?.available === false && route.reason === 'unavailable' ? 'Não foi possível calcular a rota agora.' : 'Rota pelas ruas não disponível no Del Flash.'} Siga pelo mapa ou abra no Google Maps ou Waze para navegação por voz.
          </p>
        )}
        {gpsText && <p className="text-[0.74rem] text-ink-500">{gpsText}</p>}
        <div className="grid grid-cols-2 gap-2">
          <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 font-semibold text-ink-800">Google Maps</a>
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ink-200 font-semibold text-ink-800">Waze</a>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
