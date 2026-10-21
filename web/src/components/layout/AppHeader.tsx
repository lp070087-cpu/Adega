'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { Bell, ChevronDown, Menu } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { setStoreStatusAction } from '@/app/actions/organization';
import { STORE_OPEN_STATE_LABEL, type StoreOpenState } from '@/lib/schedule';

/**
 * Header do painel — título da página, estado da loja, notificações e
 * menu do usuário. Mesmo desenho do topbar de plataforma.html.
 */

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

  function changeStatus(next: 'OPEN' | 'PAUSED' | 'CLOSED') {
    startTransition(async () => {
      const result = await setStoreStatusAction(next);
      if (!result.ok) window.alert(result.error);
      else router.refresh();
    });
  }

  function logout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <header className="sticky top-0 z-[400] flex flex-wrap items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5 lg:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-600 transition-all hover:bg-ink-100 lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.05rem] font-extrabold text-ink-900">{title}</h1>
        {subtitle && <p className="truncate text-[0.74rem] text-ink-500">{subtitle}</p>}
      </div>

      {effectiveStoreState === 'CLOSED_BY_SCHEDULE' && (
        <p role="status" className="order-last w-full text-xs text-ink-600">
          Novos pedidos estão fechados pelo horário configurado. A opção seguir horários não força a abertura.{' '}
          <a href="/app/configuracoes/minha-loja" className="font-semibold text-brand underline">Consultar horários</a>
        </p>
      )}

      <div className="flex max-w-full flex-wrap items-center gap-2">
        {/* Estado da loja: abrir/pausar/fechar sem sair da tela. */}
        {canChangeStatus ? (
          <div className="relative" title="Pausar ou fechar bloqueia novos pedidos. Quando habilitada, a loja segue os horários configurados, no fuso de Brasília/Recife.">
            <select
              value={storeStatus}
              disabled={pending}
              onChange={(e) => changeStatus(e.target.value as 'OPEN' | 'PAUSED' | 'CLOSED')}
              aria-label="Status da loja"
              className={cn(
                'max-w-[180px] cursor-pointer appearance-none truncate rounded-full border-0 py-1.5 pl-3.5 pr-7 text-[0.74rem] font-bold outline-none transition-all disabled:opacity-60 sm:max-w-none',
                effectiveStoreState === 'CLOSED_BY_SCHEDULE' ? STATUS_CLASS.CLOSED : STATUS_CLASS[storeStatus],
              )}
            >
              <option value="OPEN">{effectiveStoreState === 'CLOSED_BY_SCHEDULE' ? 'Fechada pelo horário' : storeStatus === 'OPEN' ? 'Aberta agora' : 'Habilitar loja'} · seguir horários</option>
              <option value="PAUSED">Loja pausada</option>
              <option value="CLOSED">Loja fechada</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.6rem]">
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>
        ) : (
          <span
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[0.74rem] font-bold',
              effectiveStoreState === 'CLOSED_BY_SCHEDULE' ? STATUS_CLASS.CLOSED : STATUS_CLASS[storeStatus],
            )}
          >
            {STORE_OPEN_STATE_LABEL[effectiveStoreState]}
          </span>
        )}

        {/* Notificações */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowAlerts((v) => !v);
              setShowUser(false);
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
            }}
            aria-expanded={showUser}
            aria-label="Menu da conta"
            className="flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-3 transition-all hover:border-brand"
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
