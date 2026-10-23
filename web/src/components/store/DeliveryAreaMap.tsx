'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  geocodeStoreAddressAction,
  setStoreCoordinatesAction,
} from '@/app/actions/organization';
import { Alert, Button, Field, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * ÁREA DE ENTREGA — esquema de leitura
 * -----------------------------------------------------------------------
 * NÃO é um mapa de ruas. É um esquema: a loja no centro, o círculo do raio
 * e os bairros posicionados pela coordenada, quando eles têm uma.
 *
 * Por que não um mapa de verdade: mapa de ruas exige biblioteca de mapa e
 * servidor de tiles. Nada disso está plugado, e desenhar um mapa falso
 * seria pior do que não desenhar nenhum — o lojista olharia para um
 * desenho bonito e acreditaria numa área de entrega que não corresponde à
 * rua. A decisão de qual desenhar mora em src/lib/maps/provider.ts, e o
 * rótulo vem de lá por prop (`tilesHint`), para que a tela e a decisão
 * nunca fiquem dizendo coisas diferentes.
 *
 * O QUE ESTE ESQUEMA MOSTRA DE VERDADE:
 *   • centro = coordenada da loja (real, cadastrada ou geocodificada)
 *   • círculo = raio configurado, em km, na mesma escala dos pontos
 *   • bairros = posição real quando existe; sem coordenada, aparecem
 *     listados como "sem posição" em vez de empilhados no centro
 *
 * As distâncias em km são calculadas com a MESMA fórmula do frete
 * (equirretangular; ver nota em `kmOffset`), então o que o lojista lê aqui
 * é o mesmo número que o checkout usa — não uma estimativa paralela.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  /** Texto vindo de mapProviderStatus() no servidor. */
  tilesHint: string;
  /** A loja já tem rua/cidade/estado preenchidos? Sem isso não há o que geocodificar. */
  addressReady: boolean;
};

type Coordinates = { latitude: number | null; longitude: number | null };

/** Distância em km entre dois pontos, no plano local. */
function kmOffset(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): { dxKm: number; dyKm: number; km: number } {
  // Mesma aproximação usada no cálculo de frete: 1 grau de latitude ≈ 110,57
  // km e 1 grau de longitude ≈ 111,32 km × cos(latitude). Para distâncias
  // urbanas o erro é de metros — e, mais importante, é a MESMA conta dos
  // dois lados, então o esquema nunca discorda do valor cobrado.
  const midLat = ((from.latitude + to.latitude) / 2) * (Math.PI / 180);
  const dxKm = (to.longitude - from.longitude) * 111.32 * Math.cos(midLat);
  const dyKm = (to.latitude - from.latitude) * 110.57;
  return { dxKm, dyKm, km: Math.sqrt(dxKm * dxKm + dyKm * dyKm) };
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function DeliveryAreaMap({
  latitude,
  longitude,
  radiusKm,
  zones,
  canManage,
  tilesHint,
  addressReady,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Rascunho local: o lojista ajusta aqui e só grava ao salvar. Assim uma
  // geocodificação que trouxe um ponto errado não vai para o banco sozinha.
  const [draft, setDraft] = useState<Coordinates>({ latitude, longitude });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'erro' | 'info'; text: string } | null>(null);

  const hasStore = draft.latitude !== null && draft.longitude !== null;
  const center = hasStore ? { latitude: draft.latitude!, longitude: draft.longitude! } : null;

  const dirty = draft.latitude !== latitude || draft.longitude !== longitude;

  // Raio efetivo: se o raio estiver zerado/ausente, usa 1 km só para o
  // desenho não dividir por zero — o valor mostrado no rótulo continua
  // sendo o do formulário, para não mentir sobre o que está configurado.
  const drawnRadius = radiusKm > 0 ? radiusKm : 1;

  const zonesWithPosition = zones.filter(
    (z) => z.latitude !== null && z.longitude !== null,
  );
  const zonesWithoutPosition = zones.filter(
    (z) => z.latitude === null || z.longitude === null,
  );

  function applyGeocoded(result: { latitude: number; longitude: number; displayName: string }) {
    setDraft({ latitude: result.latitude, longitude: result.longitude });
    setNotice({
      tone: 'ok',
      text: `${result.displayName} — confira no esquema e salve a localização.`,
    });
  }

  function geocode() {
    setNotice(null);
    startTransition(async () => {
      const result = await geocodeStoreAddressAction();
      if (!result.ok) {
        setNotice({ tone: 'erro', text: result.error });
        return;
      }
      if (result.data) applyGeocoded(result.data);
    });
  }

  function useDeviceLocation() {
    setNotice(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setNotice({ tone: 'erro', text: 'Este dispositivo não expõe localização.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        });
        setNotice({
          tone: 'ok',
          text: 'Posição do dispositivo aplicada. Confira e salve se estiver correta.',
        });
      },
      (error) => {
        setNotice({
          tone: 'erro',
          // Nada de coordenada de reserva: permissão negada é permissão
          // negada, e a tela diz isso em vez de inventar um ponto.
          text:
            error.code === error.PERMISSION_DENIED
              ? 'Permissão de localização negada. Autorize no navegador ou informe as coordenadas.'
              : 'Não foi possível obter a localização agora.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  function save() {
    setNotice(null);
    startTransition(async () => {
      const result = await setStoreCoordinatesAction({
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      if (!result.ok) {
        setNotice({ tone: 'erro', text: result.error });
        return;
      }
      setNotice({ tone: 'ok', text: 'Localização da loja salva.' });
      router.refresh();
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3.5">
      <div className="mb-3">
        <p className="text-[0.84rem] font-semibold text-ink-800">Localização e área de entrega</p>
        <p className="mt-0.5 text-[0.74rem] text-ink-500">
          {tilesHint} O cálculo do frete usa a coordenada da loja, não o texto do endereço.
        </p>
      </div>

      {notice && (
        <div className="mb-3">
          <Alert tone={notice.tone === 'erro' ? 'danger' : notice.tone === 'ok' ? 'success' : 'info'}>
            {notice.text}
          </Alert>
        </div>
      )}

      {/* ── Ações ─────────────────────────────────────────────────────── */}
      {canManage && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={geocode}
            loading={pending}
            disabled={!addressReady}
            title={
              addressReady
                ? undefined
                : 'Preencha rua, cidade e estado para poder localizar.'
            }
          >
            ðŸ“ Localizar pelo endereço
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={useDeviceLocation}>
            🎯 Usar minha localização atual
          </Button>
          {(draft.latitude !== null || draft.longitude !== null) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft({ latitude: null, longitude: null });
                setNotice({
                  tone: 'info',
                  text: 'Coordenadas limpas. Sem coordenada, o frete cai na taxa base.',
                });
              }}
            >
              Limpar
            </Button>
          )}
        </div>
      )}

      {/* â”€â”€ Esquema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {hasStore ? (
        <div className="rounded-md border border-ink-100 bg-ink-50/50 p-3">
          <div className="relative mx-auto aspect-square w-full max-w-[300px]">
            {/* Círculo do raio configurado */}
            <div
              className="pointer-events-none absolute rounded-full border-2 border-brand/50 bg-brand-light/25"
              style={{ left: '8%', top: '8%', width: '84%', height: '84%' }}
              aria-hidden
            />
            {/* Anéis de referência na metade do raio */}
            <div
              className="pointer-events-none absolute rounded-full border border-dashed border-ink-200"
              style={{ left: '29%', top: '29%', width: '42%', height: '42%' }}
              aria-hidden
            />

            {/* A loja, no centro */}
            <div
              className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[0.8rem] text-white shadow-sm"
              style={{ left: '50%', top: '50%' }}
              title="Sua loja"
            >
              ðŸª
            </div>

            {/* Bairros posicionados */}
            {zonesWithPosition.map((zone) => {
              const off = kmOffset(center!, {
                latitude: zone.latitude!,
                longitude: zone.longitude!,
              });
              const dentro = off.km <= drawnRadius;
              // Escala: a borda do círculo (42% do lado) corresponde ao raio.
              const left = Math.min(98, Math.max(2, 50 + (off.dxKm / drawnRadius) * 42));
              const top = Math.min(98, Math.max(2, 50 - (off.dyKm / drawnRadius) * 42));
              return (
                <div
                  key={zone.id}
                  className={cn(
                    'absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[0.6rem] font-bold shadow-sm ring-2 ring-white',
                    !zone.active
                      ? 'bg-ink-300 text-white'
                      : dentro
                        ? 'bg-success text-white'
                        : 'bg-danger text-white',
                  )}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={`${zone.name} — ${formatKm(off.km)} da loja${
                    dentro ? '' : ' (fora do raio)'
                  }${zone.active ? '' : ' · inativo'}`}
                >
                  {zone.active ? (dentro ? '✓' : '!') : '–'}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[0.68rem] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
              Loja
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" aria-hidden />
              Bairro dentro do raio
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
              Bairro fora do raio
            </span>
          </div>

          <p className="mt-2 text-center text-[0.7rem] text-ink-400">
            Você entrega em até <strong className="text-ink-600">{radiusKm} km</strong> da loja. O
            círculo é o raio; o anel tracejado marca a metade.
          </p>

          {zonesWithoutPosition.length > 0 && (
            <p className="mt-1.5 text-center text-[0.7rem] text-ink-400">
              {zonesWithoutPosition.length === 1
                ? '1 bairro sem coordenada não aparece no esquema:'
                : `${zonesWithoutPosition.length} bairros sem coordenada não aparecem no esquema:`}{' '}
              {zonesWithoutPosition.map((z) => z.name).join(', ')}. A taxa deles continua valendo —
              a coordenada é só desenho.
            </p>
          )}
        </div>
      ) : (
        <Alert tone="info" title="Loja ainda sem coordenada">
          Sem a coordenada da loja não há como medir distância: o frete por distância cai na taxa
          base e o esquema da área não pode ser desenhado. Use “Localizar pelo endereço” (precisa
          do endereço preenchido) ou informe as coordenadas abaixo.
        </Alert>
      )}

      {/* â”€â”€ Coordenadas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="mt-3 grid gap-x-4 sm:grid-cols-2">
        <Field label="Latitude" hint="Ex.: -7.1195">
          <Input
            value={draft.latitude === null ? '' : String(draft.latitude)}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                latitude: e.target.value.trim() === '' ? null : Number(e.target.value),
              }))
            }
            inputMode="decimal"
            disabled={!canManage}
            placeholder="-7.1195"
          />
        </Field>
        <Field label="Longitude" hint="Ex.: -34.8450">
          <Input
            value={draft.longitude === null ? '' : String(draft.longitude)}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                longitude: e.target.value.trim() === '' ? null : Number(e.target.value),
              }))
            }
            inputMode="decimal"
            disabled={!canManage}
            placeholder="-34.8450"
          />
        </Field>
      </div>

      {canManage && (
        <div className="mt-3 flex items-center gap-3">
          <Button type="button" size="sm" onClick={save} loading={pending} disabled={!dirty}>
            Salvar localização
          </Button>
          {dirty && <span className="text-[0.72rem] text-warn">Alterações não salvas</span>}
        </div>
      )}
    </div>
  );
}

