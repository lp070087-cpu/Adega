'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, LocateFixed, MapPin, Search } from 'lucide-react';
import { geocodeCheckoutAddressAction } from '@/app/actions/orders';

/**
 * Ponto exato da entrega: o cliente localiza o endereço, aproxima o mapa e
 * arrasta (ou toca) o pino até a porta certa, depois confirma. Só o ponto
 * CONFIRMADO vai para o pedido — nunca a coordenada aproximada da busca.
 * Sem permissão de localização, a busca e o toque no mapa continuam
 * funcionando. Mapa: OpenStreetMap (sem chave).
 */
type Point = { latitude: number; longitude: number };

export function DeliveryPinPicker({ slug, storeCenter, readAddress }: { slug: string; storeCenter: Point | null; readAddress: () => string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState<Point | null>(null);
  const [confirmed, setConfirmed] = useState<Point | null>(null);
  const [status, setStatus] = useState<{ tone: 'info' | 'warn' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Mapa criado quando o cliente abre a seção.
  useEffect(() => {
    if (!open || map.current) return;
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !box.current) return;
      leaflet.current = L;
      const start = pin ?? storeCenter;
      const instance = L.map(box.current, { center: start ? [start.latitude, start.longitude] : [-14.235, -51.925], zoom: start ? 16 : 4 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(instance);
      instance.on('click', (event) => place({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      map.current = instance;
      requestAnimationFrame(() => instance.invalidateSize());
      if (pin) drawMarker(pin);
    });
    return () => { disposed = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { map.current?.remove(); map.current = null; marker.current = null; }, []);

  function drawMarker(point: Point) {
    const L = leaflet.current, instance = map.current;
    if (!L || !instance) return;
    if (!marker.current) {
      marker.current = L.marker([point.latitude, point.longitude], {
        draggable: true, keyboard: true, title: 'Ponto de entrega (arraste para ajustar)', alt: 'Ponto de entrega',
        icon: L.divIcon({ className: 'df-store-pin df-destination-pin', html: '<span aria-hidden="true"></span>', iconSize: [34, 44], iconAnchor: [17, 42] }),
      }).addTo(instance);
      marker.current.on('dragend', () => { const at = marker.current!.getLatLng(); place({ latitude: at.lat, longitude: at.lng }, false); });
    } else marker.current.setLatLng([point.latitude, point.longitude]);
  }

  function place(point: Point, move = true) {
    setPin(point);
    setConfirmed(null);
    setStatus({ tone: 'info', text: 'Ajuste o pino até a porta ou entrada exata e toque em Confirmar ponto.' });
    drawMarker(point);
    if (move) map.current?.panTo([point.latitude, point.longitude]);
  }

  async function locateAddress() {
    const query = readAddress();
    setOpen(true);
    if (query.trim().length < 5) { setStatus({ tone: 'warn', text: 'Preencha rua e número acima para localizar, ou toque no mapa no local da entrega.' }); return; }
    setBusy(true);
    try {
      const result = await geocodeCheckoutAddressAction({ slug, query });
      if (!result.ok || !result.data) { setStatus({ tone: 'warn', text: result.ok ? 'Endereço não encontrado.' : result.error }); return; }
      const point = { latitude: result.data.latitude, longitude: result.data.longitude };
      // Espera o mapa existir (primeira abertura) antes de posicionar.
      const wait = () => new Promise<void>((resolve) => { const tick = () => (map.current ? resolve() : setTimeout(tick, 60)); tick(); });
      await wait();
      map.current?.setView([point.latitude, point.longitude], 17);
      place(point, false);
      setStatus({ tone: 'info', text: 'Encontramos o endereço. Confira e arraste o pino até a entrada exata antes de confirmar.' });
    } catch {
      setStatus({ tone: 'warn', text: 'Sem conexão com o mapa agora. Toque no local da entrega ou descreva uma referência abaixo.' });
    } finally { setBusy(false); }
  }

  function useMyLocation() {
    setOpen(true);
    if (!navigator.geolocation || !window.isSecureContext) { setStatus({ tone: 'warn', text: 'Seu aparelho não forneceu a localização. Busque o endereço ou toque no mapa.' }); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        map.current?.setView([point.latitude, point.longitude], 18);
        place(point, false);
      },
      (error) => { setBusy(false); setStatus({ tone: 'warn', text: error.code === error.PERMISSION_DENIED ? 'Localização não permitida. Tudo bem: busque o endereço ou toque no mapa no local da entrega.' : 'Não foi possível obter sua localização. Busque o endereço ou toque no mapa.' }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function confirm() {
    if (!pin) return;
    setConfirmed(pin);
    setStatus({ tone: 'ok', text: 'Ponto de entrega confirmado. O entregador verá exatamente este local.' });
  }

  return (
    <section className="space-y-2.5 rounded-xl border border-ink-200 bg-white p-3" data-testid="delivery-pin">
      <div className="flex items-start gap-2">
        <MapPin size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0">
          <p className="text-[0.84rem] font-bold text-ink-900">Ponto exato da entrega</p>
          <p className="text-[0.74rem] text-ink-500">O endereço acima é o texto; aqui você marca no mapa onde o entregador deve chegar.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={locateAddress} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-2 text-[0.78rem] font-semibold text-ink-800 hover:border-brand disabled:opacity-60"><Search size={15} aria-hidden /> Localizar no mapa</button>
        <button type="button" onClick={useMyLocation} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-2 text-[0.78rem] font-semibold text-ink-800 hover:border-brand disabled:opacity-60"><LocateFixed size={15} aria-hidden /> Usar minha localização</button>
      </div>
      {open && (
        <div className="relative isolate h-64 overflow-hidden rounded-lg border border-ink-100 bg-ink-50">
          <div ref={box} className="df-map absolute inset-0" aria-label="Mapa para marcar o ponto de entrega" data-testid="delivery-pin-map" />
          {pin && <button type="button" onClick={() => map.current?.setView([pin.latitude, pin.longitude], 18)} aria-label="Aproximar do pino" className="absolute bottom-2 right-2 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand shadow"><Crosshair size={20} aria-hidden /></button>}
        </div>
      )}
      {status && <p role="status" className={`text-[0.76rem] ${status.tone === 'ok' ? 'font-semibold text-success' : status.tone === 'warn' ? 'text-amber-800' : 'text-ink-600'}`}>{status.text}</p>}
      {open && <button type="button" onClick={confirm} disabled={!pin || Boolean(confirmed)} className="min-h-11 w-full rounded-lg bg-brand px-3 text-[0.82rem] font-bold text-white disabled:opacity-50">{confirmed ? '✓ Ponto confirmado' : 'Confirmar ponto de entrega'}</button>}
      {confirmed && (
        <>
          <input type="hidden" name="deliveryLatitude" value={confirmed.latitude.toFixed(6)} />
          <input type="hidden" name="deliveryLongitude" value={confirmed.longitude.toFixed(6)} />
        </>
      )}
    </section>
  );
}
