'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, LocateFixed, Search } from 'lucide-react';
import { reversePlaceAction, searchPlaceAction, type PlaceResult } from '@/app/actions/geo';

/**
 * Seletor de local com pino central fixo: o cliente move o mapa até a porta
 * certa, vê o endereço aproximado e confirma. Só o toque em "Confirmar local"
 * vale como confirmação — a busca e o GPS apenas posicionam o mapa.
 * Mapa: OpenStreetMap (sem chave). Endereço aproximado e CEP passam pelo
 * servidor, com limite por IP.
 */
export type Point = { latitude: number; longitude: number };
export type PlaceFields = Extract<PlaceResult, { ok: true }>['fields'];
export type ConfirmedPlace = Point & { label: string | null; fields: PlaceFields | null };

const BRAZIL: Point = { latitude: -14.235, longitude: -51.925 };

export function LocationPicker({
  slug,
  start,
  fallbackCenter,
  initialQuery,
  onConfirm,
  onClose,
}: {
  slug: string;
  /** Ponto já confirmado antes (abre exatamente nele). */
  start: Point | null;
  /** Centro de referência quando não há ponto nem endereço (ex.: a loja). */
  fallbackCenter: Point | null;
  /** Endereço digitado no formulário, buscado ao abrir. */
  initialQuery?: string;
  onConfirm: (place: ConfirmedPlace) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const reverseTimer = useRef<number | null>(null);
  const lastReverse = useRef(0);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<{ label: string | null; fields: PlaceFields | null; loading: boolean; error: string | null }>({ label: null, fields: null, loading: false, error: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Endereço aproximado do centro, depois que o mapa para de mexer.
  function scheduleReverse() {
    if (reverseTimer.current) window.clearTimeout(reverseTimer.current);
    reverseTimer.current = window.setTimeout(async () => {
      const center = map.current?.getCenter();
      if (!center) return;
      const ticket = ++lastReverse.current;
      setPlace((p) => ({ ...p, loading: true, error: null }));
      const result = await reversePlaceAction({ slug, latitude: center.lat, longitude: center.lng }).catch(() => ({ ok: false as const, error: 'Endereço aproximado indisponível agora.' }));
      if (ticket !== lastReverse.current) return;
      setPlace(result.ok ? { label: result.label, fields: result.fields, loading: false, error: null } : { label: null, fields: null, loading: false, error: result.error });
    }, 650);
  }

  useEffect(() => {
    let disposed = false;
    document.documentElement.style.overflow = 'hidden';
    import('leaflet').then(async (L) => {
      if (disposed || !box.current) return;
      const initial = start ?? fallbackCenter ?? BRAZIL;
      const instance = L.map(box.current, { center: [initial.latitude, initial.longitude], zoom: start ? 18 : fallbackCenter ? 15 : 4, zoomControl: false, attributionControl: true });
      L.control.zoom({ position: 'topright' }).addTo(instance);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(instance);
      instance.on('movestart', () => setMoving(true));
      instance.on('moveend', () => { setMoving(false); scheduleReverse(); });
      map.current = instance;
      requestAnimationFrame(() => instance.invalidateSize());
      setReady(true);
      if (start) scheduleReverse();
      else if ((initialQuery ?? '').trim().length >= 5) await search(initialQuery!);
      else scheduleReverse();
    });
    return () => {
      disposed = true;
      document.documentElement.style.overflow = '';
      if (reverseTimer.current) window.clearTimeout(reverseTimer.current);
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function search(text = query) {
    if (text.trim().length < 3) { setNotice('Digite o endereço com rua e número, ou o CEP.'); return; }
    setBusy(true);
    setNotice(null);
    const result = await searchPlaceAction({ slug, query: text }).catch(() => ({ ok: false as const, error: 'O mapa não respondeu agora. Tente de novo.' }));
    setBusy(false);
    if (!result.ok) { setNotice(result.error); return; }
    map.current?.setView([result.latitude, result.longitude], 18);
    setNotice('Confira no mapa e ajuste até a entrada exata.');
  }

  function useMyLocation() {
    if (!navigator.geolocation || !window.isSecureContext) { setNotice('Este aparelho não forneceu a localização. Busque o endereço ou mova o mapa.'); return; }
    setBusy(true);
    setNotice('Procurando sua localização…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy(false);
        setNotice('Esta é a posição do seu aparelho. Ajuste até a entrada exata antes de confirmar.');
        map.current?.setView([position.coords.latitude, position.coords.longitude], 18);
      },
      (error) => {
        setBusy(false);
        setNotice(error.code === error.PERMISSION_DENIED ? 'Localização não permitida. Tudo bem: busque o endereço ou mova o mapa até o local.' : 'Não foi possível obter sua localização. Busque o endereço ou mova o mapa.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  function confirm() {
    const center = map.current?.getCenter();
    if (!center) return;
    onConfirm({ latitude: Number(center.lat.toFixed(6)), longitude: Number(center.lng.toFixed(6)), label: place.label, fields: place.fields });
  }

  return (
    <div className="df-picker fixed inset-0 z-[1300] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Escolher o local da entrega" data-testid="location-picker">
      <div className="z-[2] flex items-center gap-2 border-b border-ink-100 bg-white px-3 py-2.5 shadow-sm">
        <button type="button" onClick={onClose} aria-label="Voltar sem confirmar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-700 hover:bg-ink-50">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <form className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-ink-50 pl-3.5 pr-1 focus-within:ring-2 focus-within:ring-brand" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <Search size={16} className="shrink-0 text-ink-400" aria-hidden />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar endereço ou CEP" placeholder="Endereço ou CEP" enterKeyHint="search" className="min-h-11 min-w-0 flex-1 bg-transparent text-[0.9rem] outline-none" />
          <button type="submit" disabled={busy} className="min-h-9 shrink-0 rounded-full bg-brand px-3.5 text-[0.8rem] font-bold text-white disabled:opacity-60">Buscar</button>
        </form>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={box} className="df-map absolute inset-0" data-testid="location-picker-map" />
        {/* Pino fixo no centro: quem se move é o mapa. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full" aria-hidden>
          <div className={`df-center-pin ${moving ? 'is-moving' : ''}`} />
          <div className="df-center-pin-shadow" />
        </div>
        {notice && (
          <p role="status" className="absolute left-3 right-14 top-3 z-[600] mx-auto max-w-md rounded-xl bg-ink-900/90 px-3.5 py-2.5 text-center text-[0.8rem] text-white shadow-lg">{notice}</p>
        )}
        <button type="button" onClick={useMyLocation} disabled={busy || !ready} className="absolute bottom-4 right-3 z-[600] flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3.5 text-[0.8rem] font-semibold text-ink-800 shadow-md ring-1 ring-ink-100 disabled:opacity-60">
          <LocateFixed size={17} className="text-brand" aria-hidden /> Usar minha localização
        </button>
      </div>

      <div className="z-[2] space-y-3 border-t border-ink-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-8px_24px_rgba(11,31,58,.08)]">
        <div>
          <p className="text-[0.7rem] font-bold uppercase tracking-wider text-ink-400">Local da entrega</p>
          <p className="mt-0.5 min-h-[2.6em] text-[0.92rem] font-semibold leading-snug text-ink-900" data-testid="location-picker-address" aria-live="polite">
            {moving ? 'Solte o mapa no ponto exato…' : place.loading ? 'Buscando o endereço aproximado…' : place.label ?? place.error ?? 'Mova o mapa até a porta ou entrada exata.'}
          </p>
          <p className="text-[0.74rem] text-ink-500">O endereço acima é aproximado; vale o ponto sob o pino.</p>
        </div>
        <button type="button" onClick={confirm} disabled={!ready || moving} className="min-h-12 w-full rounded-xl bg-brand text-[0.95rem] font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
          Confirmar local
        </button>
      </div>
    </div>
  );
}
