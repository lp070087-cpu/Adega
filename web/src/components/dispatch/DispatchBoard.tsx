'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn, formatBRL } from '@/lib/utils';
import { DRIVER_STATUS_LABEL } from '@/data/business-copy';
import {
  assignDriverAction,
  unassignDriverAction,
  reassignDriverAction,
  updateOrderStatusAction,
} from '@/app/actions/orders';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Modal,
  Select,
  StatCard,
} from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAPA / EXPEDIÇÃO
 * -----------------------------------------------------------------------
 * Duas listas que precisam ser olhadas juntas: pedidos esperando
 * entregador e entregadores na rua. É a tela de despacho.
 *
 * SOBRE O MAPA: não há mapa de verdade aqui. Um mapa real exige uma
 * chave do Google Maps, que não está configurada — e desenhar um mapa
 * falso seria pior que não desenhar nenhum. O que existe é o "radar":
 * um painel de posições relativas, calculado a partir das coordenadas
 * reais que os entregadores enviam. Se não há coordenada, o cartão diz
 * "sem sinal" em vez de fingir um ponto no mapa.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type DispatchOrder = {
  id: string;
  displayId: number;
  status: string;
  customerName: string;
  deliveryDistrict: string | null;
  deliveryAddress: string;
  deliveryFee: number;
  total: number;
  createdAt: string;
  readyAt: string | null;
  driverId: string | null;
  driverName: string | null;
  itemCount: number;
};

export type DispatchDriver = {
  id: string;
  name: string;
  status: string;
  vehiclePlate: string | null;
  position: { latitude: number; longitude: number; at: string } | null;
  activeOrders: number;
  onShift?: boolean;
  shiftLabel?: string;
};

const URGENT_MINUTES = 20;

export function DispatchBoard({
  orders,
  drivers,
  storePosition,
  canDispatch,
}: {
  orders: DispatchOrder[];
  drivers: DispatchDriver[];
  /** Coordenadas da loja, quando cadastradas — o centro do radar. */
  storePosition: { latitude: number; longitude: number } | null;
  canDispatch: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<DispatchOrder | null>(null);

  // "Agora" fixado na renderização: usar Date.now() direto no corpo do
  // componente daria um valor diferente a cada re-render e faria os
  // minutos piscarem sem motivo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => {
      if (document.hidden || !navigator.onLine || pending) return;
      setNow(Date.now());
      router.refresh();
    };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [router, pending]);

  const waiting = useMemo(
    () => orders.filter((o) => o.status === 'WAITING_DRIVER' || o.status === 'READY'),
    [orders],
  );
  const onTheRoad = useMemo(
    () => orders.filter((o) => o.status === 'DISPATCHED'),
    [orders],
  );

  const freeDrivers = drivers.filter((d) => d.status === 'ONLINE' && d.activeOrders === 0 && d.onShift !== false);
  const busyDrivers = drivers.filter((d) => d.activeOrders > 0);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível concluir.');
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível concluir">
          {error}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="⏳"
          label="Esperando entregador"
          value={String(waiting.length)}
          hint={waiting.length > 0 ? 'Precisam de despacho' : 'Nada na fila'}
          tone={waiting.length > 0 ? 'orange' : 'green'}
        />
        <StatCard icon="🛵" label="Na rua" value={String(onTheRoad.length)} hint="Pedidos despachados" tone="blue" />
        <StatCard
          icon="✅"
          label="Entregadores livres"
          value={String(freeDrivers.length)}
          hint={`${drivers.length} na frota`}
          tone="green"
        />
        <StatCard
          icon="🔵"
          label="Entregadores ocupados"
          value={String(busyDrivers.length)}
          hint="Com pedido atribuído"
          tone="purple"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        {/* ── Fila de despacho ─────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Fila de despacho"
            subtitle="Prontos e aguardando um entregador"
            action={
              <Link
                href="/app/pedidos"
                className="text-[0.78rem] font-semibold text-brand hover:underline"
              >
                Central de Pedidos
              </Link>
            }
          />

          {waiting.length === 0 ? (
            <EmptyState
              icon="✅"
              title="Nada esperando entregador"
              description="Quando um pedido ficar pronto e ainda não tiver entregador, ele aparece aqui."
            />
          ) : (
            <ul className="space-y-2.5">
              {waiting.map((order) => {
                const minutesWaiting = order.readyAt
                  ? Math.max(0, Math.round((now - new Date(order.readyAt).getTime()) / 60000))
                  : null;
                const urgent = minutesWaiting !== null && minutesWaiting >= URGENT_MINUTES;

                return (
                  <li
                    key={order.id}
                    className={cn(
                      'rounded border-2 px-4 py-3 transition-colors',
                      urgent ? 'border-warn/40 bg-warn-bg' : 'border-ink-100 bg-white',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.88rem] font-extrabold text-ink-900">
                            #{order.displayId}
                          </span>
                          <Badge tone={order.status === 'READY' ? 'green' : 'yellow'}>
                            {order.status === 'READY' ? 'Pronto' : 'Aguardando'}
                          </Badge>
                          {urgent && <Badge tone="red">+{minutesWaiting} min</Badge>}
                        </div>
                        <p className="mt-1 text-[0.8rem] text-ink-600">
                          {order.customerName} · {order.itemCount} item
                          {order.itemCount === 1 ? '' : 's'} · {formatBRL(order.total)}
                        </p>
                        <p className="mt-0.5 text-[0.72rem] text-ink-400">
                          {order.deliveryAddress}
                          {order.deliveryDistrict ? ` — ${order.deliveryDistrict}` : ''}
                        </p>
                      </div>

                      {canDispatch && (
                        <Button size="sm" onClick={() => setAssignTarget(order)} disabled={pending}>
                          {order.driverId ? 'Trocar entregador' : 'Atribuir entregador'}
                        </Button>
                      )}
                    </div>

                    {order.driverName && (
                      <p className="mt-2 text-[0.72rem] text-ink-500">
                        Já atribuído a <strong>{order.driverName}</strong>.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ── Radar ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Radar da frota"
              subtitle="Posições enviadas pelo app do entregador"
            />

            <Alert tone="neutral">
              Posições compartilhadas pelos entregadores. Confira o horário da última atualização;
              o deslocamento não é acompanhado automaticamente.
            </Alert>

            <div className="mt-4">
              {drivers.length === 0 ? (
                <EmptyState
                  icon="🛵"
                  title="Nenhum entregador ativo"
                  description="Cadastre a frota para acompanhar as posições."
                />
              ) : (
                <Radar drivers={drivers} storePosition={storePosition} now={now} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Na rua agora" subtitle="Pedidos despachados" />
            {onTheRoad.length === 0 ? (
              <p className="py-6 text-center text-[0.8rem] text-ink-400">
                Nenhum pedido em rota neste momento.
              </p>
            ) : (
              <ul className="space-y-2">
                {onTheRoad.map((order) => (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-3 rounded border border-ink-100 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.82rem] font-bold text-ink-800">#{order.displayId}</p>
                      <p className="truncate text-[0.72rem] text-ink-500">
                        {order.driverName ?? 'Sem entregador'} · saiu {agoFrom(order.createdAt, now)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {assignTarget && (
        <AssignModal
          order={assignTarget}
          drivers={drivers}
          pending={pending}
          onClose={() => setAssignTarget(null)}
          onAssign={(driverId, reason) =>
            run(
              () => assignTarget.driverId ? reassignDriverAction({ orderId: assignTarget.id, driverId, reason }) : assignDriverAction({ orderId: assignTarget.id, driverId }),
              () => setAssignTarget(null),
            )
          }
          onMarkReady={() =>
            run(
              () => updateOrderStatusAction({ orderId: assignTarget.id, status: 'READY' }),
              () => setAssignTarget(null),
            )
          }
        />
      )}
    </div>
  );
}

// ── RADAR ──────────────────────────────────────────────────────────────

/**
 * Projeção simples: latitude cresce para cima, longitude para a direita,
 * com escala em km. Não é Mercator — para distâncias de entrega urbana a
 * diferença é irrelevante, e a conta fica verificável.
 */
function Radar({
  drivers,
  storePosition,
  now,
}: {
  drivers: DispatchDriver[];
  storePosition: { latitude: number; longitude: number } | null;
  now: number;
}) {
  const withPosition = drivers.filter((d) => d.position);
  const center = storePosition ?? (withPosition[0]?.position
    ? { latitude: withPosition[0].position.latitude, longitude: withPosition[0].position.longitude }
    : null);

  if (!center) {
    return (
      <div className="space-y-3">
        <Alert tone="warn" title="Sem coordenadas para desenhar o radar">
          Nem a loja nem os entregadores têm posição registrada. O radar aparece quando o primeiro
          entregador enviar a posição pelo app — ou quando as coordenadas da loja forem cadastradas
          em Minha Loja.
        </Alert>
        <DriverList drivers={drivers} now={now} />
      </div>
    );
  }

  // Raio em graus ≈ 2 km, o suficiente para leitura urbana.
  const span = 0.02;
  const points = withPosition.map((driver) => {
    const dx = (driver.position!.longitude - center.longitude) / span;
    const dy = (driver.position!.latitude - center.latitude) / span;
    return {
      driver,
      // Limitado à borda: quem está longe fica na borda, não fora do quadro.
      left: clamp(50 + dx * 50, 4, 96),
      top: clamp(50 - dy * 50, 4, 96),
    };
  });

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-full border-2 border-ink-200 bg-ink-50">
        {/* Anéis de distância */}
        {[0.33, 0.66].map((scale) => (
          <div
            key={scale}
            className="pointer-events-none absolute rounded-full border border-dashed border-ink-200"
            style={{
              left: `${50 - scale * 50}%`,
              top: `${50 - scale * 50}%`,
              width: `${scale * 100}%`,
              height: `${scale * 100}%`,
            }}
            aria-hidden
          />
        ))}

        {/* Loja no centro */}
        <div
          className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[0.8rem] text-white shadow-sm"
          style={{ left: '50%', top: '50%' }}
          title="Sua loja"
        >
          🏪
        </div>

        {points.map(({ driver, left, top }) => (
          <div
            key={driver.id}
            className={cn(
              'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[0.75rem] shadow-sm ring-2 ring-white',
              driver.status === 'BUSY'
                ? 'bg-warn text-white'
                : driver.status === 'ONLINE'
                  ? 'bg-success text-white'
                  : 'bg-ink-400 text-white',
            )}
            style={{ left: `${left}%`, top: `${top}%` }}
            title={`${driver.name} — ${DRIVER_STATUS_LABEL[driver.status] ?? driver.status}`}
          >
            🛵
          </div>
        ))}

        {points.length === 0 && (
          <p className="absolute inset-x-0 bottom-3 px-6 text-center text-[0.7rem] text-ink-500">
            Nenhum entregador transmitindo posição agora.
          </p>
        )}
      </div>

      <p className="text-center text-[0.7rem] text-ink-400">
        Anéis a cada ~660 m. Fora do alcance, o ponto fica na borda.
      </p>

      <DriverList drivers={drivers} now={now} />
    </div>
  );
}

function DriverList({ drivers, now }: { drivers: DispatchDriver[]; now: number }) {
  return (
    <ul className="space-y-2">
      {drivers.map((driver) => (
        <li
          key={driver.id}
          className="flex items-center justify-between gap-3 rounded border border-ink-100 px-3.5 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-[0.82rem] font-semibold text-ink-800">
              {driver.name}
              {driver.vehiclePlate && (
                <span className="ml-2 text-[0.68rem] font-normal text-ink-400">
                  {driver.vehiclePlate}
                </span>
              )}
            </p>
            <p className="text-[0.7rem] text-ink-500">
              {driver.position
                ? `Sinal ${agoFrom(driver.position.at, now)}`
                : 'Sem sinal de posição'}
              {driver.activeOrders > 0 &&
                ` · ${driver.activeOrders} pedido${driver.activeOrders === 1 ? '' : 's'}`}
              {driver.shiftLabel && ` · ${driver.shiftLabel}`}
            </p>
          </div>
          <Badge
            tone={
              driver.status === 'BUSY' ? 'yellow' : driver.status === 'ONLINE' ? 'green' : 'neutral'
            }
          >
            {DRIVER_STATUS_LABEL[driver.status] ?? driver.status}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

// ── MODAL DE DESPACHO ──────────────────────────────────────────────────

function AssignModal({
  order,
  drivers,
  pending,
  onClose,
  onAssign,
  onMarkReady,
}: {
  order: DispatchOrder;
  drivers: DispatchDriver[];
  pending: boolean;
  onClose: () => void;
  onAssign: (driverId: string, reason: string) => void;
  onMarkReady: () => void;
}) {
  // Sugere quem está livre primeiro: despachar para quem já tem pedido
  // atrasa as duas entregas.
  const ordered = [...drivers].sort((a, b) => {
    const score = (d: DispatchDriver) => (d.activeOrders > 0 ? 1 : 0) + (d.status === 'ONLINE' ? 0 : 2);
    return score(a) - score(b);
  });

  const eligible = (driver: DispatchDriver) => driver.status === 'ONLINE' && driver.activeOrders === 0 && driver.onShift !== false;
  const [driverId, setDriverId] = useState(ordered.find(eligible)?.id ?? '');
  const [reason, setReason] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title={`${order.driverId ? 'Trocar entregador' : 'Atribuir entregador'} · #${order.displayId}`}
      subtitle={`${order.customerName} · ${formatBRL(order.total)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            loading={pending}
            disabled={!driverId || !ordered.some(driver => driver.id === driverId && eligible(driver)) || Boolean(order.driverId && reason.trim().length < 5)}
            onClick={() => onAssign(driverId, reason.trim())}
          >
            {order.driverId ? 'Confirmar troca' : 'Atribuir entregador'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[0.82rem] text-ink-600">
        {order.deliveryAddress}
        {order.deliveryDistrict ? ` — ${order.deliveryDistrict}` : ''}
      </p>

      {drivers.length === 0 ? (
        <Alert tone="warn">
          Nenhum entregador ativo. Cadastre a frota antes de despachar.
        </Alert>
      ) : (
        <Field label="Entregador" hint="Disponibilidade, escala e pedidos em andamento são conferidos novamente ao atribuir.">
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Selecione um entregador disponível</option>
            {ordered.map((driver) => (
              <option key={driver.id} value={driver.id} disabled={!eligible(driver)}>
                {driver.name} — {DRIVER_STATUS_LABEL[driver.status] ?? driver.status}
                {driver.activeOrders > 0 ? ` (${driver.activeOrders} em rota)` : ' (livre)'}
                {driver.shiftLabel ? ` · ${driver.shiftLabel}` : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {order.driverId && <Field label="Motivo da troca" hint="A troca só é permitida antes da retirada e será registrada no histórico."><textarea className="field-input min-h-20" value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={300} placeholder="Informe o motivo com pelo menos 5 caracteres" /></Field>}

      {!order.driverId && order.status !== 'READY' && (
        <div className="mt-2">
          <Alert tone="neutral">
            Este pedido ainda não foi marcado como pronto. Dá para despachar assim mesmo — mas o
            tempo de espera do entregador vai contar a partir de agora.
            <div className="mt-2.5">
              <Button size="sm" variant="secondary" onClick={onMarkReady} disabled={pending}>
                Marcar como pronto primeiro
              </Button>
            </div>
          </Alert>
        </div>
      )}
    </Modal>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Como timeAgo(), mas contra o "agora" fixado na renderização.
 *
 * timeAgo() lê Date.now() internamente. Numa lista que re-renderiza a
 * cada troca de estado, isso faria o texto de cada linha ser recalculado
 * com relógios ligeiramente diferentes — e "há 3 min" virar "há 4 min"
 * no meio de uma interação, sem nada ter mudado no servidor.
 */
function agoFrom(value: string | null, now: number): string {
  if (!value) return '—';
  const diff = now - new Date(value).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}
