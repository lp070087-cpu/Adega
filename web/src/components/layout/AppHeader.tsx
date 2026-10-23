'use client';
import { announceStoreAvailability } from '@/components/store/StoreAvailabilitySync';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { Bell, Check, ChevronDown, Menu } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { setStoreOpeningModeAction } from '@/app/actions/store-opening';
import { STORE_OPENING_MODE_LABEL, type StoreOpeningMode, STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';

/**
 * Header do painel — título da página, estado da loja, notificações e
 * menu do usuário. Mesmo desenho do topbar de plataforma.html.
 */

const MODE_OPTIONS: Array<{ value: StoreOpeningMode; label: string; short: string; hint: string }> = [
  { value: 'AUTO', label: 'Automático', short: 'Auto', hint: 'Segue os horários cadastrados.' },
  { value: 'MANUAL_OPEN', label: 'Aberta manualmente', short: 'Aberta', hint: 'Recebe pedidos fora da agenda.' },
  { value: 'MANUAL_CLOSED', label: 'Fechada manualmente', short: 'Fechada', hint: 'Bloqueia novos pedidos.' },
];

const STATUS_CLASS = {
  OPEN: 'bg-success-bg text-success',
  PAUSED: 'bg-warn-bg text-warn',
  CLOSED: 'bg-danger-bg text-danger',
} as const;

export function AppHeader({
  title,
  subtitle,
  storeStatus,
  effectiveStoreState = storeStatus,
  openingMode = 'AUTO',
  canChangeStatus,
  userName,
  roleLabel,
  notifications,
  onOpenMenu,
}: {
  title: string;
  subtitle?: string;
  storeStatus: 'OPEN' | 'PAUSED' | 'CLOSED';
  effectiveStoreState?: StoreOpenState;
  openingMode?: StoreOpeningMode;
  canChangeStatus: boolean;
  userName: string;
  roleLabel: string;
  notifications: Array<{ id: string; title: string; message: string | null; href: string | null; createdAt: string }>;
  onOpenMenu: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showUser, setShowUser] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const controls = useRef<HTMLDivElement>(null);

  // Menus fecham ao tocar fora ou com Esc; nenhum abre sozinho.
  useEffect(() => {
    if (!showMode && !showAlerts && !showUser) return;
    const close = () => { setShowMode(false); setShowAlerts(false); setShowUser(false); };
    const onPointer = (event: PointerEvent) => { if (!controls.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [showMode, showAlerts, showUser]);

  function changeStatus(next: StoreOpeningMode) {
    setShowMode(false);
    if (next === openingMode) return;
    startTransition(async () => {
      const result = await setStoreOpeningModeAction(next);
      if (!result.ok) window.alert(result.error);
      else { announceStoreAvailability(result.slug); router.refresh(); }
    });
  }

  function logout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <header className="sticky top-0 z-[400] flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4 lg:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink-600 transition-all hover:bg-ink-100 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.05rem] font-extrabold text-ink-900">{title}</h1>
        {subtitle && <p className="truncate text-[0.74rem] text-ink-500">{subtitle}</p>}
      </div>

      {effectiveStoreState === 'CLOSED_BY_SCHEDULE' && (
        <p role="status" className="order-last w-full text-xs text-ink-600">
          Novos pedidos estão fechados pelo horário configurado. Escolha Aberta manualmente para atender fora da agenda.{' '}
          <a href="/app/configuracoes/minha-loja" className="font-semibold text-brand underline">Consultar horários</a>
        </p>
      )}

      <div ref={controls} className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2">
        {/* Estado da loja: abrir/pausar/fechar sem sair da tela. */}
        {canChangeStatus ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowMode((v) => !v); setShowAlerts(false); setShowUser(false); }}
              disabled={pending}
              aria-haspopup="listbox"
              aria-expanded={showMode}
              aria-label={`Modo da loja: ${STORE_OPENING_MODE_LABEL[openingMode]}. Alterar`}
              data-testid="store-mode"
              className={cn(
                'flex h-9 items-center gap-1 rounded-full pl-2.5 pr-1.5 text-[0.74rem] min-[360px]:pl-3 min-[360px]:pr-2 font-bold transition-all disabled:opacity-60',
                effectiveStoreState === 'CLOSED_BY_SCHEDULE' ? STATUS_CLASS.CLOSED : STATUS_CLASS[storeStatus],
              )}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-current min-[360px]:hidden" />
              <span className="hidden min-[360px]:inline sm:hidden">{MODE_OPTIONS.find((o) => o.value === openingMode)?.short}</span>
              <span className="hidden sm:inline">{STORE_OPENING_MODE_LABEL[openingMode]}</span>
              <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 transition-transform', showMode && 'rotate-180')} />
            </button>
            {showMode && (
              <ul role="listbox" aria-label="Modo da loja" className="absolute right-0 top-11 z-10 w-[min(260px,calc(100vw-1.5rem))] rounded-lg border border-ink-200 bg-white p-1.5 shadow-lg animate-fade-in">
                {MODE_OPTIONS.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === openingMode}
                      onClick={() => changeStatus(option.value)}
                      className="flex min-h-11 w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left hover:bg-ink-50"
                    >
                      <Check aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0 text-brand', option.value !== openingMode && 'invisible')} />
                      <span className="min-w-0">
                        <span className="block text-[0.82rem] font-semibold text-ink-800">{option.label}</span>
                        <span className="block text-[0.72rem] text-ink-500">{option.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <span
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[0.74rem] font-bold',
              effectiveStoreState === 'CLOSED_BY_SCHEDULE' ? STATUS_CLASS.CLOSED : STATUS_CLASS[storeStatus],
            )}
          >
            {STORE_OPENING_MODE_LABEL[openingMode]} · {STORE_OPEN_STATE_LABEL[effectiveStoreState]}
          </span>
        )}

        {/* Notificações */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAlerts((v) => !v);
              setShowUser(false);
              setShowMode(false);
            }}
            aria-label="Notificações"
            aria-expanded={showAlerts}
            className="relative flex h-9 w-9 items-center justify-center rounded-sm text-[1.05rem] text-ink-600 transition-all hover:bg-ink-100"
          >
            <Bell aria-hidden="true" className="h-[19px] w-[19px]" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-brand px-1 text-center text-[0.6rem] font-bold text-white">
                {notifications.length}
              </span>
            )}
          </button>

          {showAlerts && (
            <div className="absolute right-0 top-11 w-[min(320px,calc(100vw-2rem))] max-h-[65dvh] overflow-y-auto rounded-lg border border-ink-200 bg-white p-2 shadow-lg animate-fade-in">
              <p className="px-2 py-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-ink-400">
                Notificações
              </p>
              {notifications.length === 0 ? (
                <p className="px-2 py-3 text-[0.8rem] text-ink-500">Nada por aqui.</p>
              ) : (
                notifications.slice(0, 8).map((n) => (
                  <a
                    key={n.id}
                    href={n.href ?? '#'}
                    onClick={() => setShowAlerts(false)}
                    className="block rounded-sm px-2 py-2 transition-all hover:bg-ink-50"
                  >
                    <p className="text-[0.8rem] font-semibold text-ink-800">{n.title}</p>
                    {n.message && <p className="text-[0.72rem] text-ink-500">{n.message}</p>}
                  </a>
                ))
              )}
            </div>
          )}
        </div>

        {/* Menu do usuário */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowUser((v) => !v);
              setShowAlerts(false);
              setShowMode(false);
            }}
            aria-expanded={showUser}
            aria-label="Menu da conta"
            className="flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-1 transition-all hover:border-brand sm:pr-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[0.68rem] font-bold text-white">
              {userName.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-[0.76rem] font-semibold text-ink-700 sm:inline">
              {userName.split(' ')[0]}
            </span>
          </button>

          {showUser && (
            <div className="absolute right-0 top-11 w-[220px] rounded-lg border border-ink-200 bg-white p-2 shadow-lg animate-fade-in">
              <div className="border-b border-ink-100 px-2 py-2">
                <p className="truncate text-[0.82rem] font-bold text-ink-800">{userName}</p>
                <p className="text-[0.7rem] text-ink-500">{roleLabel}</p>
              </div>

              <a
                href="/app/configuracoes"
                onClick={() => setShowUser(false)}
                className="block rounded-sm px-2 py-2 text-[0.8rem] text-ink-700 transition-all hover:bg-ink-50"
              >
                Minha conta
              </a>
              <button
                type="button"
                onClick={logout}
                disabled={pending}
                className="w-full rounded-sm px-2 py-2 text-left text-[0.8rem] font-semibold text-danger transition-all hover:bg-danger-bg disabled:opacity-60"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
