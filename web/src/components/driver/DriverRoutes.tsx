'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as VectorMap } from 'maplibre-gl';
import type { CircleMarker, LayerGroup, Map as LeafletMap, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowDown, ArrowUp, Crosshair, LocateFixed, Navigation, Sparkles } from 'lucide-react';
import { driverRoutePlanAction, type RoutePlanStop } from '@/app/actions/drivers';
import { requestDriverLocation, useDriverLocationPref } from '@/lib/driver-location-pref';
import { navigationUrl } from '@/lib/driver-nav-url';
import { DRIVER_MAP_REGION, loadDriverBasemap, setTransitVisible, type BasemapStatus } from '@/lib/maps/driver-basemap';
import { cn, formatBRL } from '@/lib/utils';
import { Alert, Button } from '@/components/ui';
import { DriverNavigation } from '@/components/driver/DriverNavigation';

/**
 * Minhas rotas — o entregador vê todas as entregas atribuídas a ele num
 * mapa, monta a própria sequência (ou pede uma sugestão pelo menor tempo,
 * quando há serviço de rotas) e inicia a navegação dentro do app.
 *
 * Privacidade: a posição do entregador só é lida com "Usar minha
 * localização" ligado (Conta), fica neste aparelho e vai ao servidor apenas
 * para calcular o trajeto — não é gravada nem mostrada à loja. Sem ela, o
 * trajeto parte da loja. A sequência fica salva só neste aparelho.
 */

export type RouteOrder = {
  id: string;
  displayId: number;
  customerName: string;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryAddress: string;
  deliveryNumber: string | null;
  deliveryDistrict: string | null;
  deliveryCity: string | null;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  notes: string | null;
  stepLabel: string;
};

type Point = { latitude: number; longitude: number };
type Plan = Extract<Awaited<ReturnType<typeof driverRoutePlanAction>>, { ok: true }>;

const SEQ_KEY = 'df-route-seq';
const PAYMENT: Record<string, string> = { CASH: 'Dinheiro', PIX: 'PIX', CREDIT_CARD: 'Crédito', DEBIT_CARD: 'Débito', ONLINE: 'Online', OTHER: 'Outro' };
const formatDistance = (meters: number) => (meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`);
const formatDuration = (seconds: number) => { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`; };
const addressOf = (o: RouteOrder) => [o.deliveryNumber ? `${o.deliveryAddress}, ${o.deliveryNumber}` : o.deliveryAddress, o.deliveryDistrict, o.deliveryCity].filter(Boolean).join(' — ');
function metersBetween(a: Point, b: Point) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}
function readSeq(): string[] { try { const v = JSON.parse(window.localStorage.getItem(SEQ_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } }
function writeSeq(seq: string[]) { try { window.localStorage.setItem(SEQ_KEY, JSON.stringify(seq)); } catch { /* sem armazenamento: vale nesta tela */ } }

export function DriverRoutes({ orders, storeOrigin, preview, onOpenOrder, autoNavigate, onAutoNavigate }: {
  orders: RouteOrder[];
  storeOrigin: Point | null;
  preview: boolean;
  onOpenOrder: (orderId: string) => void;
  autoNavigate: string | null;
  onAutoNavigate: () => void;
}) {
  const [locationEnabled, setLocationEnabled] = useDriverLocationPref();
  const useLocation = locationEnabled;
  const [askingLocation, setAskingLocation] = useState(false);
  const [watchAttempt, setWatchAttempt] = useState(0);
  const ids = useMemo(() => orders.map((o) => o.id), [orders]);
  const idsKey = ids.join(',');
  const [seq, setSeq] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [plannedFocus, setPlannedFocus] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'warn' | 'danger' | 'neutral'; text: string } | null>(null);
  const [me, setMe] = useState<(Point & { accuracy: number }) | null>(null);
  const [gps, setGps] = useState<'off' | 'waiting' | 'ok' | 'denied' | 'unavailable'>('off');
  const [navigating, setNavigating] = useState<string | null>(null);
  const lastPlanFrom = useRef<{ point: Point | null; at: number } | null>(null);
  const latestRequest = useRef(0);
  useEffect(() => {
    if (!autoNavigate || !orders.some((order) => order.id === autoNavigate)) return;
    setFocus(autoNavigate);
    setNavigating(autoNavigate);
    onAutoNavigate();
  }, [autoNavigate, onAutoNavigate, orders]);

  async function authorizeLocation() {
    setAskingLocation(true);
    const result = await requestDriverLocation();
    setAskingLocation(false);
    if (result.ok) {
      setMe(result.position);
      setGps('ok');
      setWatchAttempt((attempt) => attempt + 1);
      setLocationEnabled(true);
    } else {
      setMe(null);
      setGps(result.reason);
    }
  }

  // Sequência: a salva neste aparelho, sem entregas concluídas, com as novas no fim.
  useEffect(() => {
    setSeq((current) => {
      const base = current.length ? current : readSeq();
      const next = [...base.filter((id) => ids.includes(id)), ...ids.filter((id) => !base.includes(id))];
      writeSeq(next);
      return next;
    });
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!useLocation) { setGps('off'); setMe(null); return; }
    if (!navigator.geolocation || !window.isSecureContext) { setGps('unavailable'); return; }
    let watchId: number | undefined;
    let generation = 0;
    function stopWatch() {
      generation++;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = undefined;
    }
    function refreshWatch() {
      stopWatch();
      if (document.hidden) return;
      const current = generation;
      setGps((state) => state === 'ok' ? state : 'waiting');
      watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          if (current !== generation) return;
          setMe({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
          setGps('ok');
        },
        (error) => {
          if (current !== generation) return;
          setMe(null);
          setGps(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
      );
    }
    refreshWatch();
    document.addEventListener('visibilitychange', refreshWatch);
    return () => {
      stopWatch();
      document.removeEventListener('visibilitychange', refreshWatch);
    };
  }, [useLocation, watchAttempt]);

  const seqKey = seq.join(',');
  const selectedId = orders.some((order) => order.id === focus) ? focus : null;
  const request = useCallback(async (options: { optimize?: boolean } = {}) => {
    const requestId = ++latestRequest.current;
    if (!seq.length || preview) { setPlan(null); setLoading(false); return; }
    setLoading(true);
    const from = useLocation && me ? { latitude: me.latitude, longitude: me.longitude } : null;
    try {
      const result = await driverRoutePlanAction({ sequence: seq, from, optimize: options.optimize, focus: options.optimize ? null : selectedId });
      if (requestId !== latestRequest.current) return;
      if (!result.ok) { setMessage({ tone: 'danger', text: result.error }); return; }
      lastPlanFrom.current = { point: from, at: Date.now() };
      setPlan(result);
      setPlannedFocus(options.optimize ? null : selectedId);
      if (options.optimize) {
        if (result.optimized) { setFocus(null); setSeq(result.sequence); writeSeq(result.sequence); setMessage({ tone: 'success', text: 'Sequência sugerida pelo menor tempo estimado pelas ruas. Você pode reorganizar quando quiser.' }); }
        else setMessage({ tone: 'warn', text: result.routing ? 'Não foi possível calcular a melhor sequência agora. Tente de novo em instantes.' : 'A sugestão de sequência precisa de um serviço de rotas, ainda não ativado no Del Flash. Organize a ordem manualmente.' });
      }
    } catch {
      if (requestId !== latestRequest.current) return;
      setMessage({ tone: 'danger', text: 'Sem conexão. O mapa volta a atualizar quando a internet voltar.' });
    } finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [seq, useLocation, me, selectedId, preview]);

  // Recalcula quando a sequência, o foco ou a fonte de saída mudam.
  const meReady = useLocation && Boolean(me);
  useEffect(() => { void request(); }, [seqKey, selectedId, meReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // ...e ao andar ~300 m (no máximo a cada 60 s).
  useEffect(() => {
    if (!me || !useLocation) return;
    const last = lastPlanFrom.current;
    if (last?.point && Date.now() - last.at > 60000 && metersBetween(last.point, me) > 300) void request();
  }, [me, useLocation, request]);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= seq.length) return;
    const next = [...seq];
    [next[index], next[target]] = [next[target], next[index]];
    setSeq(next); writeSeq(next); setMessage(null);
  }

  const byId = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const stopById = useMemo(() => new Map((plan?.stops ?? []).map((s) => [s.orderId, s])), [plan]);
  const ordered = seq.map((id) => byId.get(id)).filter((o): o is RouteOrder => Boolean(o));
  const route = plan?.route.available && plan.sequence.join(',') === seqKey && selectedId === plannedFocus ? plan.route : null;
  const legs = route && !selectedId ? route.legs : [];
  const navOrder = navigating ? byId.get(navigating) : undefined;
  const navLinks = navOrder ? linksFor(navOrder) : null;

  function linksFor(order: RouteOrder, stop = stopById.get(order.id)) {
    return navigationUrl({
      latitude: order.deliveryLatitude ?? stop?.latitude ?? null,
      longitude: order.deliveryLongitude ?? stop?.longitude ?? null,
      address: addressOf(order),
    });
  }
  const chosen = selectedId ? byId.get(selectedId) : ordered[0];
  const chosenLinks = chosen ? linksFor(chosen) : null;
  function visitFirst(id: string) {
    const next = [id, ...seq.filter((stopId) => stopId !== id)];
    setSeq(next);
    writeSeq(next);
    setMessage(null);
  }

  return (
    <section className="space-y-4" aria-label="Mapa e rotas" data-testid="driver-routes">
      <div className="space-y-3 rounded-2xl border border-ink-100 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 px-1">
          <div>
            <h2 className="text-lg font-extrabold text-ink-900">Mapa de entregas</h2>
            <p className="text-sm text-ink-500">{orders.length === 0 ? 'Aguardando pedidos da loja' : `${orders.length} ${orders.length === 1 ? 'entrega em aberto' : 'entregas em aberto'}`}</p>
          </div>
          {gps === 'ok'
            ? <span className="flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand"><LocateFixed size={14} aria-hidden /> GPS ativo</span>
            : <Button size="sm" variant="secondary" disabled={askingLocation} onClick={() => void authorizeLocation()}><LocateFixed size={16} aria-hidden /> {askingLocation ? 'Aguardando GPS…' : 'Ativar localização'}</Button>}
        </div>
        <RouteMap stops={ordered.map((o, i) => ({ order: o, stop: stopById.get(o.id), n: i + 1 }))} store={plan?.store ?? storeOrigin} me={useLocation ? me : null} route={route?.coordinates ?? null} selected={selectedId} onSelect={(id) => setFocus(id)} />
        <p className="px-1 text-xs text-ink-600" aria-live="polite">
          {gps === 'denied' ? 'Permita a localização para este site nos ajustes do celular e tente novamente.'
            : gps === 'unavailable' ? 'GPS indisponível. Confira a localização do celular e tente novamente.'
            : gps === 'waiting' ? 'Buscando sua localização…'
            : gps === 'ok' ? 'Sua posição atualiza enquanto o mapa está aberto na tela.'
            : 'Permita o acesso ao GPS para ver sua posição no mapa.'}
        </p>
        {chosen && chosenLinks && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-500">{chosen.id === ordered[0]?.id ? 'Primeira parada' : 'Parada selecionada'}</p>
            <p className="break-words text-sm font-bold text-ink-900">#{chosen.displayId} · {chosen.customerName}</p>
            <p className="break-words text-xs text-ink-600">{addressOf(chosen)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {chosen.id !== ordered[0]?.id && <Button size="sm" variant="secondary" onClick={() => visitFirst(chosen.id)}>Visitar primeiro</Button>}
            <a href={chosenLinks.google} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white"><Navigation size={15} aria-hidden /> Google Maps</a>
            <a href={chosenLinks.waze} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-lg border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-800">Waze</a>
            {plan?.routing && <Button size="sm" variant="secondary" onClick={() => setNavigating(chosen.id)}>Navegar no painel</Button>}
          </div>
        </div>}
      </div>

      {ordered.length > 0 && <>
        <div className="rounded-lg border border-ink-100 bg-white p-3" aria-live="polite">
          {loading && !route ? <p className="text-[0.8rem] text-ink-500">Calculando rota…</p>
            : route && plan ? (
              <p className="text-[0.9rem] font-bold text-ink-900" data-testid="routes-summary">
                {selectedId ? `Até o pedido #${byId.get(selectedId)?.displayId}: ` : `${ordered.length} parada${ordered.length === 1 ? '' : 's'}: `}
                {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}{' '}
                <span className="text-[0.72rem] font-normal text-ink-500">pelas ruas, saindo {plan.startKind === 'me' ? 'da sua posição' : plan.startKind === 'store' ? 'da loja' : 'da 1ª parada'}</span>
              </p>
            ) : (
              <p className="text-[0.78rem] text-ink-600" data-testid="routes-no-route">
                {!plan?.routing ? 'Abra a entrega no Google Maps ou no Waze para calcular o trajeto pelas ruas.' : !plan.startKind && ordered.length <= 1 ? 'Para traçar o trajeto até a entrega, ative a localização no mapa.' : 'Não foi possível calcular o trajeto agora.'}
              </p>
            )}
        </div>

        {plan?.routing && <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" disabled={loading || ordered.length < 2} onClick={() => void request({ optimize: true })}>
            <Sparkles size={16} aria-hidden /> Sugerir sequência
          </Button>
          <Button onClick={() => setNavigating(chosen?.id ?? null)}>
            <Navigation size={16} aria-hidden /> Iniciar navegação
          </Button>
        </div>}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <ol className="space-y-2" aria-label="Sequência de entregas">
          {ordered.map((o, i) => {
            const stop = stopById.get(o.id);
            const links = linksFor(o, stop);
            return (
              <li key={o.id} className={cn('rounded-lg border bg-white p-3', focus === o.id ? 'border-danger ring-1 ring-danger/30' : 'border-ink-100')} data-testid="route-stop">
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-extrabold text-white', focus === o.id ? 'bg-danger' : 'bg-brand')} aria-label={`Parada ${i + 1}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.86rem] font-bold text-ink-900">#{o.displayId} · {o.customerName}</p>
                    <p className="mt-0.5 break-words text-[0.78rem] text-ink-600">{addressOf(o)}</p>
                    <p className="mt-0.5 text-[0.72rem] text-ink-500">
                      {o.stepLabel} · {formatBRL(o.total)} · {PAYMENT[o.paymentMethod] ?? o.paymentMethod}{o.paymentStatus === 'PAID' ? ' (pago)' : ' (cobrar)'}
                      {legs[i] ? ` · +${formatDuration(legs[i].durationSeconds)}` : ''}
                    </p>
                    {o.notes && <p className="mt-0.5 break-words text-[0.72rem] text-ink-500">Obs.: {o.notes}</p>}
                    {stop?.approximate && <p className="mt-0.5 text-[0.7rem] font-semibold text-amber-700">Posição aproximada pelo endereço.</p>}
                    {stop && stop.latitude == null && <p className="mt-0.5 text-[0.7rem] font-semibold text-amber-700">Endereço não localizado no mapa.</p>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir pedido #${o.displayId}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-ink-200 text-ink-700 disabled:opacity-30"><ArrowUp size={18} aria-hidden /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === ordered.length - 1} aria-label={`Descer pedido #${o.displayId}`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-ink-200 text-ink-700 disabled:opacity-30"><ArrowDown size={18} aria-hidden /></button>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button type="button" onClick={() => setFocus(focus === o.id ? null : o.id)} className="min-h-11 rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">{focus === o.id ? 'Ver rota completa' : 'Ver rota'}</button>
                  {i > 0 && <button type="button" onClick={() => visitFirst(o.id)} className="min-h-11 rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">Visitar primeiro</button>}
                  <button type="button" onClick={() => setNavigating(o.id)} className="min-h-11 rounded-lg bg-brand px-2 text-[0.76rem] font-bold text-white">Navegar</button>
                  <a href={links.google} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">Google Maps</a>
                  <a href={links.waze} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">Waze</a>
                </div>
                <button type="button" onClick={() => onOpenOrder(o.id)} className="mt-2 min-h-11 w-full rounded-lg text-[0.76rem] font-semibold text-brand">Detalhes e próximos passos</button>
              </li>
            );
          })}
        </ol>

      </>}

      {navOrder && navLinks && (
        <DriverNavigation
          orderId={navOrder.id}
          address={addressOf(navOrder)}
          reference={navOrder.notes}
          googleUrl={navLinks.google}
          wazeUrl={navLinks.waze}
          liveLocation={{ position: useLocation ? me : null, status: gps }}
          onClose={() => setNavigating(null)}
        />
      )}
    </section>
  );
}

function RouteMap({ stops, store, me, route, selected, onSelect }: {
  stops: Array<{ order: RouteOrder; stop?: RoutePlanStop; n: number }>;
  store: Point | null;
  me: (Point & { accuracy: number }) | null;
  route: Array<[number, number]> | null;
  selected: string | null;
  onSelect: (orderId: string) => void;
}) {
  const [showTransit, setShowTransit] = useState(false);
  const styleMap = useRef<VectorMap | null>(null);
  const transit = useRef(false);
  useEffect(() => {
    try {
      const visible = localStorage.getItem('df-driver-map-transit') === 'on';
      transit.current = visible;
      setShowTransit(visible);
    } catch { /* Preferência opcional. */ }
  }, []);
  function toggleTransit() {
    const visible = !transit.current;
    transit.current = visible;
    setShowTransit(visible);
    if (styleMap.current) setTransitVisible(styleMap.current, visible);
    try { localStorage.setItem('df-driver-map-transit', visible ? 'on' : 'off'); } catch { /* Preferência opcional. */ }
  }
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const layers = useRef<{ stops?: LayerGroup; me?: CircleMarker; route?: Polyline; store?: LayerGroup }>({});
  const [ready, setReady] = useState(false);
  const framedKey = useRef<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [basemap, setBasemap] = useState<BasemapStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    let cleanupBasemap: (() => void) | undefined;
    setBasemap('loading');
    import('leaflet').then((L) => {
      if (disposed || !box.current) return;
      leaflet.current = L;
      framedKey.current = null;
      // Começa na loja (ou no entregador) em vez do Brasil inteiro.
      const start: [number, number] | null = store ? [store.latitude, store.longitude] : me ? [me.latitude, me.longitude] : null;
      const instance = L.map(box.current, { center: start ?? DRIVER_MAP_REGION, zoom: start ? 14 : 13, minZoom: 2, maxZoom: 19, scrollWheelZoom: false });
      instance.on('dragstart', () => setFollow(false));
      map.current = instance;
      cleanupBasemap = loadDriverBasemap(instance, setBasemap, vector => { styleMap.current = vector; setTransitVisible(vector, transit.current); });
      layers.current.store = L.layerGroup().addTo(instance);
      layers.current.stops = L.layerGroup().addTo(instance);
      requestAnimationFrame(() => instance.invalidateSize());
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(box.current);
      instance.once('unload', () => observer.disconnect());
      setReady(true);
    }).catch(() => { if (!disposed) setBasemap('unavailable'); });
    return () => { disposed = true; cleanupBasemap?.(); styleMap.current = null; map.current?.remove(); map.current = null; layers.current = {}; setReady(false); };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const located = stops.flatMap((entry) => {
    const latitude = entry.order.deliveryLatitude ?? entry.stop?.latitude;
    const longitude = entry.order.deliveryLongitude ?? entry.stop?.longitude;
    return latitude != null && longitude != null ? [{ ...entry, point: [latitude, longitude] as [number, number] }] : [];
  });
  const markerKey = located.map((s) => `${s.order.id}:${s.n}:${s.point.join(',')}`).join('|') + `/${selected ?? ''}`;
  const frame = located.map((s) => `${s.order.id}:${s.point.join(',')}`).sort().join('|') + `/${store?.latitude ?? ''},${store?.longitude ?? ''}/${Boolean(me)}`;
  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    layers.current.stops?.clearLayers();
    for (const s of located) {
      const marker = L.marker(s.point, {
        icon: L.divIcon({ className: cn('df-stop-pin', selected === s.order.id && 'is-selected'), html: `<span>${s.n}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: `Parada ${s.n}: pedido #${s.order.displayId}`, alt: `Parada ${s.n}`, keyboard: true,
      });
      marker.on('click', () => { setFollow(false); onSelect(s.order.id); });
      marker.addTo(layers.current.stops!);
    }
  }, [ready, markerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    layers.current.store?.clearLayers();
    if (store) L.marker([store.latitude, store.longitude], { icon: L.divIcon({ className: 'df-store-pin', html: '<span aria-hidden="true"></span>', iconSize: [34, 44], iconAnchor: [17, 42] }), title: 'Loja', alt: 'Loja' }).addTo(layers.current.store!);
    layers.current.route?.remove(); layers.current.route = undefined;
    if (route) layers.current.route = L.polyline(route, { color: '#087ea4', weight: 5, opacity: 0.85 }).addTo(instance);
  }, [ready, store?.latitude, store?.longitude, route]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    if (me) {
      if (!layers.current.me) layers.current.me = L.circleMarker([me.latitude, me.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#087ea4', fillOpacity: 1 }).addTo(instance);
      else layers.current.me.setLatLng([me.latitude, me.longitude]);
    } else { layers.current.me?.remove(); layers.current.me = undefined; }
    if (frame !== framedKey.current) {
      framedKey.current = frame;
      const points = located.map((s) => s.point);
      if (me) points.push([me.latitude, me.longitude]);
      else if (store) points.push([store.latitude, store.longitude]);
      if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
      else if (points[0]) instance.setView(points[0], 15, { animate: false });
    } else if (me && follow) {
      instance.panInside([me.latitude, me.longitude], { padding: [34, 34], animate: false });
    }
  }, [ready, frame, me, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  function center() {
    const L = leaflet.current, instance = map.current;
    if (!L || !instance) return;
    setFollow(false);
    const points = located.map((s) => s.point);
    if (me) points.push([me.latitude, me.longitude]);
    else if (store) points.push([store.latitude, store.longitude]);
    if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    else if (points[0]) instance.setView(points[0], 15);
  }

  function centerOnMe() {
    const instance = map.current;
    if (!instance || !me) return;
    setFollow(true);
    instance.setView([me.latitude, me.longitude], Math.max(instance.getZoom(), 15));
  }

  return (
    <div className="relative isolate h-[62dvh] min-h-[320px] max-h-[700px] overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
      <button type="button" onClick={toggleTransit} aria-pressed={showTransit} className="absolute right-3 top-3 z-[500] min-h-11 rounded-xl bg-white px-3 text-xs font-bold text-ink-800 shadow"> {showTransit ? 'Ocultar transporte público' : 'Mostrar transporte público'}</button>
      <div ref={box} className="df-map absolute inset-0" aria-label="Mapa das entregas" data-testid="routes-map" data-basemap={basemap} />
      {basemap === 'loading' && <p className="pointer-events-none absolute inset-x-3 top-3 z-[550] mx-auto w-fit rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-ink-700 shadow" role="status">Carregando ruas e bairros…</p>}
      {basemap === 'unavailable' && (
        <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-3 bg-ink-50 p-6 text-center" role="alert" data-testid="routes-map-error">
          <p className="text-sm font-semibold text-ink-800">As ruas do mapa não carregaram.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Tentar novamente</button>
        </div>
      )}
      {basemap === 'ready' && <div className="absolute bottom-7 right-3 z-[500] flex flex-col gap-2">
        {me && <button type="button" onClick={centerOnMe} aria-label="Centralizar na minha localização" title="Minha localização" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand shadow-lg"><LocateFixed size={21} aria-hidden /></button>}
        {(located.length > 0 || store) && <button type="button" onClick={center} aria-label="Enquadrar entregas" title="Enquadrar entregas" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand shadow-lg"><Crosshair size={21} aria-hidden /></button>}
      </div>}
    </div>
  );
}
