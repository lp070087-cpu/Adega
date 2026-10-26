'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CircleMarker, LayerGroup, Map as LeafletMap, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowDown, ArrowUp, Crosshair, Navigation, Sparkles } from 'lucide-react';
import { driverRoutePlanAction, type RoutePlanStop } from '@/app/actions/drivers';
import { useDriverLocationPref } from '@/lib/driver-location-pref';
import { navigationUrl } from '@/lib/driver-nav-url';
import { cn, formatBRL } from '@/lib/utils';
import { Alert, Button, Card, EmptyState } from '@/components/ui';
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

export function DriverRoutes({ orders, onOpenOrder, onOpenSettings, autoNavigate = null }: { orders: RouteOrder[]; onOpenOrder: (orderId: string) => void; onOpenSettings: () => void; autoNavigate?: string | null }) {
  const [useLocation] = useDriverLocationPref();
  const ids = useMemo(() => orders.map((o) => o.id), [orders]);
  const idsKey = ids.join(',');
  const [seq, setSeq] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'warn' | 'danger' | 'neutral'; text: string } | null>(null);
  const [me, setMe] = useState<(Point & { accuracy: number }) | null>(null);
  const [gps, setGps] = useState<'off' | 'waiting' | 'ok' | 'denied' | 'unavailable'>('off');
  const [navigating, setNavigating] = useState<string | null>(null);
  const lastPlanFrom = useRef<{ point: Point | null; at: number } | null>(null);
  // "Ir para entrega" abre a navegação direto no pedido escolhido.
  useEffect(() => { if (autoNavigate && ids.includes(autoNavigate)) setNavigating(autoNavigate); }, [autoNavigate, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sequência: a salva neste aparelho, sem entregas concluídas, com as novas no fim.
  useEffect(() => {
    setSeq((current) => {
      const base = current.length ? current : readSeq();
      const next = [...base.filter((id) => ids.includes(id)), ...ids.filter((id) => !base.includes(id))];
      writeSeq(next);
      return next;
    });
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posição: só com a opção ligada e esta aba aberta.
  useEffect(() => {
    if (!useLocation) { setGps('off'); setMe(null); return; }
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) { setGps('unavailable'); return; }
    setGps('waiting');
    const id = navigator.geolocation.watchPosition(
      (p) => { setGps('ok'); setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }); },
      (e) => setGps(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [useLocation]);

  const seqKey = seq.join(',');
  const request = useCallback(async (options: { optimize?: boolean } = {}) => {
    if (!seq.length) { setPlan(null); return; }
    setLoading(true);
    const from = useLocation && me ? { latitude: me.latitude, longitude: me.longitude } : null;
    try {
      const result = await driverRoutePlanAction({ sequence: seq, from, optimize: options.optimize, focus });
      if (!result.ok) { setMessage({ tone: 'danger', text: result.error }); return; }
      lastPlanFrom.current = { point: from, at: Date.now() };
      setPlan(result);
      if (options.optimize) {
        if (result.optimized) { setSeq(result.sequence); writeSeq(result.sequence); setMessage({ tone: 'success', text: 'Sequência sugerida pelo menor tempo estimado pelas ruas. Você pode reorganizar quando quiser.' }); }
        else setMessage({ tone: 'warn', text: result.routing ? 'Não foi possível calcular a melhor sequência agora. Tente de novo em instantes.' : 'A sugestão de sequência precisa de um serviço de rotas, ainda não ativado no Del Flash. Organize a ordem manualmente.' });
      }
    } catch {
      setMessage({ tone: 'danger', text: 'Sem conexão. O mapa volta a atualizar quando a internet voltar.' });
    } finally { setLoading(false); }
  }, [seq, useLocation, me, focus]);

  // Recalcula quando a sequência, o foco ou a fonte de saída mudam.
  const meReady = useLocation && Boolean(me);
  useEffect(() => { void request(); }, [seqKey, focus, meReady]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const legs = plan?.route.available && !focus ? plan.route.legs : [];
  const navOrder = navigating ? byId.get(navigating) : undefined;

  if (!orders.length) {
    return (
      <Card>
        <EmptyState icon="🗺️" title="Nenhuma entrega para roteirizar" description="Quando a loja atribuir entregas para você, elas aparecem aqui no mapa, numeradas na ordem de visita." />
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="driver-routes">
      <RouteMap stops={ordered.map((o, i) => ({ order: o, stop: stopById.get(o.id), n: i + 1 }))} store={plan?.store ?? null} me={useLocation ? me : null} route={plan?.route.available ? plan.route.coordinates : null} selected={focus} onSelect={(id) => setFocus((f) => (f === id ? null : id))} />

      <div className="rounded-lg border border-ink-100 bg-white p-3" aria-live="polite">
        {loading && !plan ? <p className="text-[0.8rem] text-ink-500">Calculando rota…</p>
          : plan?.route.available ? (
            <p className="text-[0.9rem] font-bold text-ink-900" data-testid="routes-summary">
              {focus ? `Até o pedido #${byId.get(focus)?.displayId}: ` : `${ordered.length} parada${ordered.length === 1 ? '' : 's'}: `}
              {formatDistance(plan.route.distanceMeters)} · {formatDuration(plan.route.durationSeconds)}{' '}
              <span className="text-[0.72rem] font-normal text-ink-500">pelas ruas, saindo {plan.startKind === 'me' ? 'da sua posição' : plan.startKind === 'store' ? 'da loja' : 'da 1ª parada'}</span>
            </p>
          ) : (
            <p className="text-[0.78rem] text-ink-600" data-testid="routes-no-route">
              {!plan?.routing ? 'Trajeto pelas ruas não disponível no Del Flash.' : !plan.startKind && ordered.length <= 1 ? 'Para traçar o trajeto até a entrega, ligue a localização em Ajustes.' : 'Não foi possível calcular o trajeto agora.'} Os endereços estão numerados no mapa; use o Google Maps ou o Waze para navegar por voz.
            </p>
          )}
        <p className="mt-1 text-[0.72rem] text-ink-500">
          {gps === 'off' ? <>Localização desligada: o trajeto parte {plan?.startKind === 'store' ? 'da loja' : 'da 1ª parada (a loja não marcou a localização no cadastro)'}. <button type="button" onClick={onOpenSettings} className="font-semibold text-brand underline">Ativar em Ajustes</button></>
            : gps === 'denied' ? 'Localização negada pelo navegador. Permita a localização para este site nas configurações do aparelho.'
            : gps === 'unavailable' ? 'GPS indisponível neste aparelho ou conexão. O trajeto parte da loja.'
            : gps === 'waiting' ? 'Procurando sua localização…'
            : 'Sua posição aparece só para você e atualiza com o aplicativo aberto na tela.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={loading || ordered.length < 2} onClick={() => { setFocus(null); void request({ optimize: true }); }}>
          <Sparkles size={16} aria-hidden /> Sugerir sequência
        </Button>
        <Button disabled={!ordered.length} onClick={() => setNavigating(focus ?? ordered[0]?.id ?? null)}>
          <Navigation size={16} aria-hidden /> Iniciar navegação
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <ol className="space-y-2" aria-label="Sequência de entregas">
        {ordered.map((o, i) => {
          const stop = stopById.get(o.id);
          const links = navigationUrl({ latitude: o.deliveryLatitude ?? stop?.latitude ?? null, longitude: o.deliveryLongitude ?? stop?.longitude ?? null, address: addressOf(o) });
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
                <button type="button" onClick={() => setNavigating(o.id)} className="min-h-11 rounded-lg bg-brand px-2 text-[0.76rem] font-bold text-white">Navegar</button>
                <a href={links.google} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">Google Maps</a>
                <a href={links.waze} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-lg border border-ink-200 px-2 text-[0.76rem] font-semibold text-ink-800">Waze</a>
              </div>
              <button type="button" onClick={() => onOpenOrder(o.id)} className="mt-2 min-h-11 w-full rounded-lg text-[0.76rem] font-semibold text-brand">Detalhes e próximos passos</button>
            </li>
          );
        })}
      </ol>

      <p className="px-1 text-[0.7rem] leading-relaxed text-ink-400">
        O navegador só acompanha sua posição com o aplicativo aberto na tela; com a tela bloqueada ou o app em segundo plano, a posição deixa de atualizar até você voltar. A loja não vê sua localização.
      </p>

      {navOrder && (
        <DriverNavigation
          orderId={navOrder.id}
          address={addressOf(navOrder)}
          reference={navOrder.notes}
          googleUrl={navigationUrl({ latitude: navOrder.deliveryLatitude, longitude: navOrder.deliveryLongitude, address: addressOf(navOrder) }).google}
          wazeUrl={navigationUrl({ latitude: navOrder.deliveryLatitude, longitude: navOrder.deliveryLongitude, address: addressOf(navOrder) }).waze}
          useLocation={useLocation}
          onClose={() => setNavigating(null)}
        />
      )}
    </div>
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
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const layers = useRef<{ stops?: LayerGroup; me?: CircleMarker; route?: Polyline; store?: LayerGroup }>({});
  const [ready, setReady] = useState(false);
  const framedKey = useRef('');
  // O mapa só aparece já enquadrado nas entregas (sem piscar o Brasil inteiro).
  const [framed, setFramed] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setFramed(true), 2500); return () => window.clearTimeout(t); }, []);

  useEffect(() => {
    let disposed = false;
    import('leaflet').then((L) => {
      if (disposed || !box.current) return;
      leaflet.current = L;
      const instance = L.map(box.current, { center: [-14.235, -51.925], zoom: 4 });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(instance);
      layers.current.store = L.layerGroup().addTo(instance);
      layers.current.stops = L.layerGroup().addTo(instance);
      map.current = instance;
      requestAnimationFrame(() => instance.invalidateSize());
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(box.current);
      instance.once('unload', () => observer.disconnect());
      setReady(true);
    });
    return () => { disposed = true; map.current?.remove(); map.current = null; layers.current = {}; };
  }, []);

  const located = stops.filter((s) => s.stop?.latitude != null && s.stop?.longitude != null);
  const key = located.map((s) => `${s.order.id}:${s.n}`).join('|') + (selected ?? '');
  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    layers.current.stops?.clearLayers();
    for (const s of located) {
      const marker = L.marker([s.stop!.latitude!, s.stop!.longitude!], {
        icon: L.divIcon({ className: cn('df-stop-pin', selected === s.order.id && 'is-selected'), html: `<span>${s.n}</span>`, iconSize: [32, 32], iconAnchor: [16, 16] }),
        title: `Parada ${s.n}: pedido #${s.order.displayId}`, alt: `Parada ${s.n}`, keyboard: true,
      });
      marker.on('click', () => onSelect(s.order.id));
      marker.addTo(layers.current.stops!);
    }
  }, [ready, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    layers.current.store?.clearLayers();
    if (store) L.marker([store.latitude, store.longitude], { icon: L.divIcon({ className: 'df-store-pin', html: '<span aria-hidden="true"></span>', iconSize: [34, 44], iconAnchor: [17, 42] }), title: 'Loja', alt: 'Loja' }).addTo(layers.current.store!);
    layers.current.route?.remove(); layers.current.route = undefined;
    if (route) layers.current.route = L.polyline(route, { color: '#087ea4', weight: 5, opacity: 0.85 }).addTo(instance);
    if (me) {
      if (!layers.current.me) layers.current.me = L.circleMarker([me.latitude, me.longitude], { radius: 8, color: '#fff', weight: 3, fillColor: '#087ea4', fillOpacity: 1 }).addTo(instance);
      else layers.current.me.setLatLng([me.latitude, me.longitude]);
    } else { layers.current.me?.remove(); layers.current.me = undefined; }
    // Enquadra paradas (e saída) quando o conjunto muda.
    const frame = located.map((s) => s.order.id).join('|');
    if (frame !== framedKey.current && (located.length || store)) {
      const points: Array<[number, number]> = located.map((s) => [s.stop!.latitude!, s.stop!.longitude!]);
      if (me) points.push([me.latitude, me.longitude]); else if (store) points.push([store.latitude, store.longitude]);
      if (points.length === 1) instance.setView(points[0], 15, { animate: false }); else if (points.length) instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
      framedKey.current = frame;
      setFramed(true);
    }
  }, [ready, store, route, me, key]); // eslint-disable-line react-hooks/exhaustive-deps

  function center() {
    const L = leaflet.current, instance = map.current;
    if (!L || !instance) return;
    const points: Array<[number, number]> = located.map((s) => [s.stop!.latitude!, s.stop!.longitude!]);
    if (me) points.push([me.latitude, me.longitude]);
    if (points.length > 1) instance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 }); else if (points[0]) instance.setView(points[0], 15);
  }

  return (
    <div className="relative isolate h-[58dvh] min-h-[300px] overflow-hidden rounded-xl border border-ink-100 bg-ink-50">
      <div ref={box} className={cn('df-map absolute inset-0 transition-opacity duration-300', framed ? 'opacity-100' : 'opacity-0')} aria-label="Mapa das entregas" data-testid="routes-map" />
      {!framed && <p className="absolute inset-0 z-[400] flex items-center justify-center text-[0.8rem] text-ink-500">Carregando o mapa das entregas…</p>}
      <button type="button" onClick={center} aria-label="Enquadrar entregas" className="absolute bottom-3 right-3 z-[500] flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand shadow-lg"><Crosshair size={22} aria-hidden /></button>
    </div>
  );
}
