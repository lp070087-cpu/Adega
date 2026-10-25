'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Circle, CircleMarker, LayerGroup, Map as LeafletMap, Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, LocateFixed, MapPin } from 'lucide-react';
import {
  geocodeStoreAddressAction,
  resolveMapLinkAction,
  reverseStoreLocationAction,
  setStoreCoordinatesAction,
} from '@/app/actions/organization';
import { Alert, Button, Field, Input } from '@/components/ui';
import { formatBRL } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LOCALIZAÇÃO E ÁREA DE ENTREGA — mapa de ruas real (Leaflet + OpenStreetMap)
 * -----------------------------------------------------------------------
 * • O marcador é a coordenada da loja. Arrastar, tocar no mapa, buscar pelo
 *   endereço ou usar a localização do aparelho só muda um RASCUNHO; nada
 *   vai para o banco antes de "Salvar localização".
 * • O círculo é o raio configurado, medido em linha reta a partir do
 *   marcador — a mesma medida usada no cálculo do frete. Não é rota: o
 *   trajeto pelas ruas costuma ser maior.
 * • Sem coordenada salva, o mapa abre no Brasil sem marcador. Nunca
 *   inventamos um ponto para a loja.
 * • Resultado de busca por endereço é aproximado (nível de rua ou bairro)
 *   e é apresentado assim; o lojista confirma arrastando o marcador.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type AreaZone = {
  id: string;
  name: string;
  fee: number;
  active: boolean;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
  position: number;
};

type Props = {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number;
  zones: AreaZone[];
  canManage: boolean;
  /** A loja já tem rua/cidade/estado preenchidos? Sem isso não há o que buscar. */
  addressReady: boolean;
  /** Preenche o endereço do formulário com o endereço do ponto confirmado. */
  onAddressFromPoint?: (fields: { street: string | null; number: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null }) => void;
};

type Point = { latitude: number; longitude: number };
type Draft = { latitude: number | null; longitude: number | null };
type Notice = { tone: 'ok' | 'erro' | 'info' | 'aviso'; text: string };

const BRAZIL: [number, number] = [-14.235, -51.925];
const valid = (d: Draft): d is Point =>
  d.latitude !== null && d.longitude !== null && Number.isFinite(d.latitude) && Number.isFinite(d.longitude) &&
  Math.abs(d.latitude) <= 90 && Math.abs(d.longitude) <= 180;
const round = (value: number) => Number(value.toFixed(6));

/** Mesma aproximação do cálculo de frete (equirretangular), em km. */
export function straightKm(from: Point, to: Point) {
  const midLat = ((from.latitude + to.latitude) / 2) * (Math.PI / 180);
  const dx = (to.longitude - from.longitude) * 111.32 * Math.cos(midLat);
  const dy = (to.latitude - from.latitude) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}
const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`);

export function DeliveryAreaMap({ latitude, longitude, radiusKm, zones, canManage, addressReady, onAddressFromPoint }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locating, setLocating] = useState(false);
  const [draft, setDraft] = useState<Draft>({ latitude, longitude });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState('');
  const [pointAddress, setPointAddress] = useState<{ label: string; fields: Parameters<NonNullable<Props['onAddressFromPoint']>>[0] } | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const marker = useRef<Marker | null>(null);
  const radius = useRef<Circle | null>(null);
  const accuracy = useRef<Circle | null>(null);
  const zoneLayer = useRef<LayerGroup | null>(null);
  const zoneMarkers = useRef<CircleMarker[]>([]);
  // Callbacks do Leaflet leem o valor atual sem recriar o mapa.
  const manage = useRef(canManage);
  manage.current = canManage;
  const describeRef = useRef<(p: Point) => void>(() => undefined);

  const point = valid(draft) ? draft : null;
  const dirty = draft.latitude !== latitude || draft.longitude !== longitude;

  // Cria o mapa uma única vez, só no navegador (Leaflet usa window).
  useEffect(() => {
    let disposed = false;
    let loaded = 0;
    let failed = 0;
    import('leaflet').then((L) => {
      if (disposed || !box.current) return;
      leaflet.current = L;
      const start = valid({ latitude, longitude }) ? { latitude: latitude!, longitude: longitude! } : null;
      const instance = L.map(box.current, {
        center: start ? [start.latitude, start.longitude] : BRAZIL,
        zoom: start ? 14 : 4,
        scrollWheelZoom: false,
        zoomControl: true,
      });
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(instance);
      tiles.on('tileload', () => { loaded++; setTilesFailed(false); });
      tiles.on('tileerror', () => { failed++; if (!loaded && failed >= 4) setTilesFailed(true); });
      // Roda do mouse só depois de clicar no mapa: rolar a página não vira zoom sem querer.
      instance.on('focus click', () => instance.scrollWheelZoom.enable());
      instance.on('blur', () => instance.scrollWheelZoom.disable());
      instance.on('click', (event) => {
        if (!manage.current) return;
        setDraft({ latitude: round(event.latlng.lat), longitude: round(event.latlng.lng) });
        describeRef.current({ latitude: round(event.latlng.lat), longitude: round(event.latlng.lng) });
        setNotice({ tone: 'info', text: 'Marcador posicionado onde você tocou. Ajuste se precisar e salve a localização.' });
      });
      zoneLayer.current = L.layerGroup().addTo(instance);
      map.current = instance;
      setReady(true);
      // O contêiner pode mudar de tamanho (abas, rotação do celular).
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(box.current);
      instance.once('unload', () => observer.disconnect());
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      radius.current = null;
      accuracy.current = null;
      zoneLayer.current = null;
    };
    // Cria apenas na montagem; atualizações chegam pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador da loja + círculo do raio acompanham o rascunho.
  useEffect(() => {
    const L = leaflet.current, instance = map.current;
    if (!ready || !L || !instance) return;
    if (!point) {
      marker.current?.remove(); marker.current = null;
      radius.current?.remove(); radius.current = null;
      return;
    }
    const at: [number, number] = [point.latitude, point.longitude];
    if (!marker.current) {
      const icon = L.divIcon({ className: 'df-store-pin', html: '<span aria-hidden="true"></span>', iconSize: [34, 44], iconAnchor: [17, 42] });
      marker.current = L.marker(at, { icon, draggable: manage.current, keyboard: true, title: 'Sua loja', alt: 'Localização da loja' }).addTo(instance);
      marker.current.on('dragend', () => {
        const moved = marker.current!.getLatLng();
        setDraft({ latitude: round(moved.lat), longitude: round(moved.lng) });
        describeRef.current({ latitude: round(moved.lat), longitude: round(moved.lng) });
        setNotice({ tone: 'info', text: 'Marcador ajustado. Salve a localização para usar este ponto no frete.' });
      });
    } else marker.current.setLatLng(at);
    if (radiusKm > 0) {
      if (!radius.current) radius.current = L.circle(at, { radius: radiusKm * 1000, color: '#087ea4', weight: 2, fillColor: '#087ea4', fillOpacity: 0.1, interactive: false }).addTo(instance);
      else radius.current.setLatLng(at).setRadius(radiusKm * 1000);
    } else { radius.current?.remove(); radius.current = null; }
  }, [ready, point?.latitude, point?.longitude, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bairros com coordenada: dentro (verde), fora (vermelho) ou inativos (cinza).
  useEffect(() => {
    const L = leaflet.current, layer = zoneLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    zoneMarkers.current = zones.filter((zone) => zone.latitude !== null && zone.longitude !== null).map((zone) => {
      const km = point ? straightKm(point, { latitude: zone.latitude!, longitude: zone.longitude! }) : null;
      const inside = km !== null && radiusKm > 0 ? km <= radiusKm : null;
      const color = !zone.active ? '#94a3b8' : inside === false ? '#dc2626' : '#16a34a';
      const label = `${zone.name} · ${formatBRL(zone.fee)}${km !== null ? ` · ${formatKm(km)} em linha reta` : ''}${inside === false ? ' · fora do raio' : ''}${zone.active ? '' : ' · inativo'}`;
      return L.circleMarker([zone.latitude!, zone.longitude!], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindTooltip(label).addTo(layer);
    });
  }, [ready, zones, point?.latitude, point?.longitude, radiusKm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { marker.current?.dragging?.[canManage ? 'enable' : 'disable'](); }, [canManage, ready, point !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  function focus(target: Point, zoom = 16) {
    map.current?.flyTo([target.latitude, target.longitude], zoom, { duration: 0.6 });
  }

  function fitArea() {
    if (!point || !map.current) return;
    if (radius.current) map.current.fitBounds(radius.current.getBounds(), { padding: [16, 16] });
    else focus(point, 15);
  }

  function geocode() {
    setNotice(null);
    startTransition(async () => {
      const result = await geocodeStoreAddressAction();
      if (!result.ok) { setNotice({ tone: 'erro', text: result.error }); return; }
      if (!result.data) return;
      const next = { latitude: round(result.data.latitude), longitude: round(result.data.longitude) };
      setDraft(next);
      focus(next, 17);
      describePoint(next);
      setNotice({ tone: 'aviso', text: `Posição aproximada encontrada para o endereço: ${result.data.displayName}. A busca pode parar no meio da rua ou no bairro — arraste o marcador até a porta da loja e salve.` });
    });
  }

  // Endereço do ponto escolhido, para o texto da loja acompanhar o mapa.
  function describePoint(target: Point) {
    setPointAddress(null);
    void reverseStoreLocationAction(target).then((result) => {
      if (result.ok) setPointAddress({ label: result.data.label, fields: { street: result.data.street, number: result.data.number, district: result.data.district, city: result.data.city, state: result.data.state, zipCode: result.data.zipCode } });
    }).catch(() => undefined);
  }

  describeRef.current = describePoint;

  function readLink() {
    setNotice(null);
    startTransition(async () => {
      const result = await resolveMapLinkAction({ url: link });
      if (!result.ok || !result.data) { setNotice({ tone: 'erro', text: result.ok ? 'Link sem coordenadas.' : result.error }); return; }
      const next = { latitude: round(result.data.latitude), longitude: round(result.data.longitude) };
      setDraft(next);
      focus(next, 18);
      describePoint(next);
      setNotice({ tone: 'info', text: 'Ponto lido do link. Confira no mapa, ajuste arrastando o marcador se precisar e salve a localização.' });
    });
  }

  function useDeviceLocation() {
    setNotice(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNotice({ tone: 'erro', text: 'Este navegador não oferece localização. Use a busca pelo endereço ou toque no mapa.' });
      return;
    }
    if (!window.isSecureContext) {
      setNotice({ tone: 'erro', text: 'A localização do aparelho só funciona em conexão segura (https).' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = { latitude: round(position.coords.latitude), longitude: round(position.coords.longitude) };
        const meters = Math.round(position.coords.accuracy);
        setDraft(next);
        focus(next, meters > 500 ? 14 : 17);
        const L = leaflet.current;
        if (L && map.current) {
          accuracy.current?.remove();
          accuracy.current = L.circle([next.latitude, next.longitude], { radius: meters, color: '#64748b', weight: 1, dashArray: '4 4', fillOpacity: 0.05, interactive: false }).addTo(map.current);
        }
        setNotice({
          tone: meters > 100 ? 'aviso' : 'ok',
          text: meters > 100
            ? `Localização do aparelho com precisão de cerca de ${meters} m (círculo tracejado). Arraste o marcador para a posição exata da loja antes de salvar.`
            : `Localização do aparelho aplicada (precisão de cerca de ${meters} m). Confira e salve.`,
        });
      },
      (error) => {
        setLocating(false);
        // Sem coordenada de reserva: falha é falha, e a tela diz isso.
        setNotice({
          tone: 'erro',
          text: error.code === error.PERMISSION_DENIED
            ? 'Permissão de localização negada. Autorize a localização para este site nas configurações do navegador, ou use a busca pelo endereço.'
            : error.code === error.TIMEOUT
              ? 'A localização demorou demais para responder. Tente de novo em local aberto ou use a busca pelo endereço.'
              : 'Não foi possível obter a localização agora. Use a busca pelo endereço ou toque no mapa.',
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  function save() {
    if (!point && (draft.latitude !== null || draft.longitude !== null)) {
      setNotice({ tone: 'erro', text: 'Coordenadas inválidas. A latitude vai de -90 a 90 e a longitude de -180 a 180.' });
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await setStoreCoordinatesAction({ latitude: draft.latitude, longitude: draft.longitude });
      if (!result.ok) { setNotice({ tone: 'erro', text: result.error }); return; }
      accuracy.current?.remove(); accuracy.current = null;
      setNotice({ tone: 'ok', text: 'Localização da loja salva.' });
      router.refresh();
    });
  }

  const positioned = zones.filter((zone) => zone.latitude !== null && zone.longitude !== null);
  const unpositioned = zones.filter((zone) => zone.latitude === null || zone.longitude === null);

  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3.5" data-testid="delivery-map">
      <div className="mb-3">
        <p className="text-[0.84rem] font-semibold text-ink-800">Localização e área de entrega</p>
        <p className="mt-0.5 text-[0.74rem] text-ink-500">
          O frete por distância usa este ponto. As distâncias são medidas em linha reta a partir da loja; o trajeto pelas ruas costuma ser maior.
        </p>
      </div>

      {notice && (
        <div className="mb-3" role={notice.tone === 'erro' ? 'alert' : 'status'}>
          <Alert tone={notice.tone === 'erro' ? 'danger' : notice.tone === 'ok' ? 'success' : notice.tone === 'aviso' ? 'warn' : 'info'}>{notice.text}</Alert>
        </div>
      )}

      {canManage && (
        <div className="mb-3">
          <label className="field-label" htmlFor="store-map-link">Link da localização no mapa (opcional)</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="store-map-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Cole o link do Google Maps, OpenStreetMap, Apple Maps ou Waze" className="min-w-0 flex-1" data-testid="store-map-link" />
            <Button type="button" size="sm" className="min-h-11 shrink-0" variant="secondary" onClick={readLink} loading={pending} disabled={!link.trim()}>Ler link</Button>
          </div>
          <p className="mt-1 text-[0.72rem] text-ink-500">No Google Maps: abra o local, toque em Compartilhar e copie o link. Se o link não trouxer coordenadas, marque o ponto no mapa.</p>
        </div>
      )}

      {canManage && (
        <div className="mb-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:flex lg:flex-wrap">
          <Button type="button" size="sm" className="min-h-11" variant="secondary" onClick={geocode} loading={pending} disabled={!addressReady} title={addressReady ? undefined : 'Preencha rua, cidade e estado para buscar.'}>
            <MapPin size={16} aria-hidden /> Localizar pelo endereço
          </Button>
          <Button type="button" size="sm" className="min-h-11" variant="secondary" onClick={useDeviceLocation} loading={locating}>
            <LocateFixed size={16} aria-hidden /> Usar minha localização atual
          </Button>
          {point && (
            <Button type="button" size="sm" className="min-h-11" variant="ghost" onClick={fitArea}>
              <Crosshair size={16} aria-hidden /> Ver área inteira
            </Button>
          )}
        </div>
      )}
      {canManage && !addressReady && <p className="-mt-1 mb-3 text-[0.72rem] text-ink-500">Para buscar pelo endereço, preencha rua, cidade e estado em Identidade e endereço.</p>}

      <div className="relative isolate overflow-hidden rounded-md border border-ink-100 bg-ink-50">
        <div ref={box} className="df-map h-[300px] w-full sm:h-[380px]" role="application" aria-label="Mapa da localização da loja e da área de entrega" />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">Carregando mapa…</p>}
        {ready && !point && (
          <p className="pointer-events-none absolute inset-x-2 top-2 z-[500] rounded-md bg-white/95 px-3 py-2 text-center text-[0.76rem] text-ink-700 shadow">
            Loja ainda sem localização. {canManage ? 'Busque pelo endereço, use sua localização ou toque no mapa no ponto da loja.' : 'Peça a quem administra a loja para marcar o ponto.'}
          </p>
        )}
        {tilesFailed && (
          <p className="absolute inset-x-2 bottom-8 z-[500] rounded-md bg-amber-50 px-3 py-2 text-center text-[0.74rem] text-amber-900 shadow">
            Não foi possível carregar as ruas agora (verifique a conexão). O marcador, o raio e o frete continuam funcionando.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />Loja</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-brand bg-brand/10" aria-hidden />Raio de {formatKm(radiusKm > 0 ? radiusKm : 0)} em linha reta</span>
        {positioned.length > 0 && <>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-success" aria-hidden />Bairro dentro do raio</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />Bairro fora do raio</span>
        </>}
      </div>
      {canManage && pointAddress && onAddressFromPoint && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-ink-50 px-3 py-2 text-[0.76rem] text-ink-700" data-testid="point-address">
          <span className="min-w-0">Endereço deste ponto: <strong>{pointAddress.label}</strong></span>
          <Button type="button" size="sm" variant="ghost" className="min-h-10" onClick={() => { onAddressFromPoint(pointAddress.fields); setNotice({ tone: 'info', text: 'Endereço da loja atualizado com o ponto do mapa. Confira o número e salve as alterações da loja.' }); }}>Usar no endereço da loja</Button>
        </div>
      )}
      {point && <p className="mt-1.5 text-[0.72rem] text-ink-500" data-testid="map-point">Ponto da loja: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}{dirty ? ' (não salvo)' : ''}</p>}
      {unpositioned.length > 0 && (
        <p className="mt-1 text-[0.7rem] text-ink-400">
          {unpositioned.length === 1 ? '1 bairro sem coordenada não aparece no mapa' : `${unpositioned.length} bairros sem coordenada não aparecem no mapa`}: {unpositioned.map((zone) => zone.name).join(', ')}. A taxa deles continua valendo.
        </p>
      )}

      <details className="mt-3 rounded-md border border-ink-100 px-3 py-2">
        <summary className="min-h-10 cursor-pointer py-2 text-[0.8rem] font-semibold text-ink-700">Ajustar coordenadas manualmente</summary>
        <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
          <Field label="Latitude" hint="De -90 a 90. Ex.: -7.119500">
            <Input value={draft.latitude === null ? '' : String(draft.latitude)} onChange={(e) => setDraft((d) => ({ ...d, latitude: e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.')) }))} inputMode="decimal" disabled={!canManage} />
          </Field>
          <Field label="Longitude" hint="De -180 a 180. Ex.: -34.845000">
            <Input value={draft.longitude === null ? '' : String(draft.longitude)} onChange={(e) => setDraft((d) => ({ ...d, longitude: e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.')) }))} inputMode="decimal" disabled={!canManage} />
          </Field>
        </div>
        {canManage && (draft.latitude !== null || draft.longitude !== null) && (
          <Button type="button" size="sm" className="min-h-11" variant="ghost" onClick={() => { setDraft({ latitude: null, longitude: null }); setNotice({ tone: 'info', text: 'Localização removida do rascunho. Sem localização, o frete por distância usa a taxa base. Salve para confirmar.' }); }}>
            Remover localização
          </Button>
        )}
      </details>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" className="min-h-11" onClick={save} loading={pending} disabled={!dirty}>Salvar localização</Button>
          {dirty && <span className="text-[0.72rem] text-warn">Alterações não salvas</span>}
        </div>
      )}
    </div>
  );
}
