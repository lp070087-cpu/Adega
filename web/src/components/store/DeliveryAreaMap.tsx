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
 * ÃREA DE ENTREGA â€” esquema de leitura
 * -----------------------------------------------------------------------
 * NÃƒO Ã© um mapa de ruas. Ã‰ um esquema: a loja no centro, o cÃ­rculo do raio
 * e os bairros posicionados pela coordenada, quando eles tÃªm uma.
 *
 * Por que nÃ£o um mapa de verdade: mapa de ruas exige biblioteca de mapa e
 * servidor de tiles. Nada disso estÃ¡ plugado, e desenhar um mapa falso
 * seria pior do que nÃ£o desenhar nenhum â€” o lojista olharia para um
 * desenho bonito e acreditaria numa Ã¡rea de entrega que nÃ£o corresponde Ã 
 * rua. A decisÃ£o de qual desenhar mora em src/lib/maps/provider.ts, e o
 * rÃ³tulo vem de lÃ¡ por prop (`tilesHint`), para que a tela e a decisÃ£o
 * nunca fiquem dizendo coisas diferentes.
 *
 * O QUE ESTE ESQUEMA MOSTRA DE VERDADE:
 *   â€¢ centro = coordenada da loja (real, cadastrada ou geocodificada)
 *   â€¢ cÃ­rculo = raio configurado, em km, na mesma escala dos pontos
 *   â€¢ bairros = posiÃ§Ã£o real quando existe; sem coordenada, aparecem
 *     listados como "sem posiÃ§Ã£o" em vez de empilhados no centro
 *
 * As distÃ¢ncias em km sÃ£o calculadas com a MESMA fÃ³rmula do frete
 * (equirretangular; ver nota em `kmOffset`), entÃ£o o que o lojista lÃª aqui
 * Ã© o mesmo nÃºmero que o checkout usa â€” nÃ£o uma estimativa paralela.
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
  /** A loja jÃ¡ tem rua/cidade/estado preenchidos? Sem isso nÃ£o hÃ¡ o que geocodificar. */
  addressReady: boolean;
};

type Coordinates = { latitude: number | null; longitude: number | null };

/** DistÃ¢ncia em km entre dois pontos, no plano local. */
function kmOffset(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): { dxKm: number; dyKm: number; km: number } {
  // Mesma aproximaÃ§Ã£o usada no cÃ¡lculo de frete: 1 grau de latitude â‰ˆ 110,57
  // km e 1 grau de longitude â‰ˆ 111,32 km Ã— cos(latitude). Para distÃ¢ncias
  // urbanas o erro Ã© de metros â€” e, mais importante, Ã© a MESMA conta dos
  // dois lados, entÃ£o o esquema nunca discorda do valor cobrado.
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

  // Rascunho local: o lojista ajusta aqui e sÃ³ grava ao salvar. Assim uma
  // geocodificaÃ§Ã£o que trouxe um ponto errado nÃ£o vai para o banco sozinha.
  const [draft, setDraft] = useState<Coordinates>({ latitude, longitude });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'erro' | 'info'; text: string } | null>(null);

  const hasStore = draft.latitude !== null && draft.longitude !== null;
  const center = hasStore ? { latitude: draft.latitude!, longitude: draft.longitude! } : null;

  const dirty = draft.latitude !== latitude || draft.longitude !== longitude;

  // Raio efetivo: se o raio estiver zerado/ausente, usa 1 km sÃ³ para o
  // desenho nÃ£o dividir por zero â€” o valor mostrado no rÃ³tulo continua
  // sendo o do formulÃ¡rio, para nÃ£o mentir sobre o que estÃ¡ configurado.
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
      text: `${result.displayName} â€” confira no esquema e salve a localizaÃ§Ã£o.`,
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
      setNotice({ tone: 'erro', text: 'Este dispositivo nÃ£o expÃµe localizaÃ§Ã£o.' });
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
          text: 'PosiÃ§Ã£o do dispositivo aplicada. Confira e salve se estiver correta.',
        });
      },
      (error) => {
        setNotice({
          tone: 'erro',
          // Nada de coordenada de reserva: permissÃ£o negada Ã© permissÃ£o
          // negada, e a tela diz isso em vez de inventar um ponto.
          text:
            error.code === error.PERMISSION_DENIED
              ? 'PermissÃ£o de localizaÃ§Ã£o negada. Autorize no navegador ou informe as coordenadas.'
              : 'NÃ£o foi possÃ­vel obter a localizaÃ§Ã£o agora.',
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
      setNotice({ tone: 'ok', text: 'LocalizaÃ§Ã£o da loja salva.' });
      router.refresh();
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3.5">
      <div className="mb-3">
        <p className="text-[0.84rem] font-semibold text-ink-800">LocalizaÃ§Ã£o e Ã¡rea de entrega</p>
        <p className="mt-0.5 text-[0.74rem] text-ink-500">
          {tilesHint} O cÃ¡lculo do frete usa a coordenada da loja, nÃ£o o texto do endereÃ§o.
        </p>
      </div>

      {notice && (
        <div className="mb-3">
          <Alert tone={notice.tone === 'erro' ? 'danger' : notice.tone === 'ok' ? 'success' : 'info'}>
            {notice.text}
          </Alert>
        </div>
      )}

      {/* â”€â”€ AÃ§Ãµes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
            ðŸ“ Localizar pelo endereÃ§o
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={useDeviceLocation}>
            ðŸŽ¯ Usar minha localizaÃ§Ã£o atual
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
            {/* CÃ­rculo do raio configurado */}
            <div
              className="pointer-events-none absolute rounded-full border-2 border-brand/50 bg-brand-light/25"
              style={{ left: '8%', top: '8%', width: '84%', height: '84%' }}
              aria-hidden
            />
            {/* AnÃ©is de referÃªncia na metade do raio */}
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
              // Escala: a borda do cÃ­rculo (42% do lado) corresponde ao raio.
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
                  title={`${zone.name} â€” ${formatKm(off.km)} da loja${
                    dentro ? '' : ' (fora do raio)'
                  }${zone.active ? '' : ' Â· inativo'}`}
                >
                  {zone.active ? (dentro ? 'âœ“' : '!') : 'â€“'}
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
            VocÃª entrega em atÃ© <strong className="text-ink-600">{radiusKm} km</strong> da loja. O
            cÃ­rculo Ã© o raio; o anel tracejado marca a metade.
          </p>

          {zonesWithoutPosition.length > 0 && (
            <p className="mt-1.5 text-center text-[0.7rem] text-ink-400">
              {zonesWithoutPosition.length === 1
                ? '1 bairro sem coordenada nÃ£o aparece no esquema:'
                : `${zonesWithoutPosition.length} bairros sem coordenada nÃ£o aparecem no esquema:`}{' '}
              {zonesWithoutPosition.map((z) => z.name).join(', ')}. A taxa deles continua valendo â€”
              a coordenada Ã© sÃ³ desenho.
            </p>
          )}
        </div>
      ) : (
        <Alert tone="info" title="Loja ainda sem coordenada">
          Sem a coordenada da loja nÃ£o hÃ¡ como medir distÃ¢ncia: o frete por distÃ¢ncia cai na taxa
          base e o esquema da Ã¡rea nÃ£o pode ser desenhado. Use â€œLocalizar pelo endereÃ§oâ€ (precisa
          do endereÃ§o preenchido) ou informe as coordenadas abaixo.
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
            Salvar localizaÃ§Ã£o
          </Button>
          {dirty && <span className="text-[0.72rem] text-warn">AlteraÃ§Ãµes nÃ£o salvas</span>}
        </div>
      )}
    </div>
  );
}

