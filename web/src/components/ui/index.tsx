'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PRIMITIVAS DE UI
 * -----------------------------------------------------------------------
 * Classes e comportamento copiados do CSS de plataforma.html. Não é um
 * design system novo: é a mesma aparência, agora em componentes.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── BOTÃO ──────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark shadow-xs',
  secondary: 'bg-white text-ink-700 border-2 border-ink-200 hover:border-brand hover:text-brand',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-danger text-white hover:brightness-95',
  success: 'bg-success text-white hover:brightness-95',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'text-[0.78rem] px-3.5 py-2 rounded-sm gap-1.5',
  md: 'text-[0.86rem] px-4 py-2.5 rounded-sm gap-2',
  lg: 'text-[0.95rem] px-6 py-3.5 rounded-full gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-200',
        'disabled:opacity-55 disabled:cursor-not-allowed active:scale-[.985]',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

// ── CAMPOS ─────────────────────────────────────────────────────────────

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('mb-3.5', className)}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="text-brand"> *</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-[0.72rem] text-ink-500">{hint}</p>}
      {error && <p className="mt-1.5 text-[0.72rem] font-medium text-danger">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} {...props} className={cn('field-input', className)} />;
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} {...props} className={cn('field-input cursor-pointer', className)}>
      {children}
    </select>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} className={cn('field-input resize-y', className)} />;
});

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2.5 text-[0.84rem] text-ink-700', className)}>
      <input
        type="checkbox"
        {...props}
        className="h-4 w-4 accent-[var(--orange)] cursor-pointer"
      />
      {label}
    </label>
  );
}

/** Campo de dinheiro com prefixo R$. */
export function MoneyInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[0.82rem] font-semibold text-ink-500">
        R$
      </span>
      <input
        {...props}
        inputMode="decimal"
        className={cn('field-input pl-10', className)}
      />
    </div>
  );
}

// ── CARTÕES ────────────────────────────────────────────────────────────

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('rounded-lg border border-ink-100 bg-white p-[22px]', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[0.95rem] font-bold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[0.76rem] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── STAT CARD ──────────────────────────────────────────────────────────

const STAT_TONES = {
  orange: 'bg-brand-light text-brand',
  blue: 'bg-info-bg text-info',
  green: 'bg-success-bg text-success',
  purple: 'bg-accent-bg text-accent',
  teal: 'bg-teal-bg text-teal',
  red: 'bg-danger-bg text-danger',
  gray: 'bg-ink-100 text-ink-600',
} as const;

export type StatTone = keyof typeof STAT_TONES;

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'orange',
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-5 transition-all duration-200 hover:shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span
          className={cn(
            'flex h-[42px] w-[42px] items-center justify-center rounded text-[1.15rem]',
            STAT_TONES[tone],
          )}
        >
          {icon}
        </span>
        {trend && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[0.68rem] font-bold',
              trend.positive ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger',
            )}
          >
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <p className="text-[0.76rem] font-medium text-ink-500">{label}</p>
      <p className="mt-1 text-[1.6rem] font-extrabold leading-none text-ink-900">{value}</p>
      {hint && <p className="mt-1.5 text-[0.72rem] text-ink-400">{hint}</p>}
    </div>
  );
}

// ── BADGES ─────────────────────────────────────────────────────────────

const BADGE_TONES = {
  neutral: 'bg-ink-100 text-ink-600',
  orange: 'bg-brand-light text-brand',
  blue: 'bg-info-bg text-info',
  green: 'bg-success-bg text-success',
  red: 'bg-danger-bg text-danger',
  yellow: 'bg-warn-bg text-warn',
  purple: 'bg-accent-bg text-accent',
  teal: 'bg-teal-bg text-teal',
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-bold',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── ESTADO VAZIO ───────────────────────────────────────────────────────

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <span className="mb-3 text-[2.4rem] opacity-70">{icon}</span>
      <p className="text-[0.92rem] font-bold text-ink-700">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-md text-[0.8rem] leading-relaxed text-ink-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── MODAL ──────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  // Esc fecha — o painel original tinha essa mesma saída rápida.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Trava o scroll do fundo enquanto o modal está aberto.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'my-auto w-full rounded-xl bg-white p-6 shadow-xl',
          widths[size],
        )}
        style={{ borderRadius: 'var(--radius-xl)' }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.05rem] font-extrabold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-1 text-[0.78rem] text-ink-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm text-ink-400 transition-all hover:bg-ink-100 hover:text-ink-700"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">{children}</div>

        {footer && (
          <div className="mt-5 flex justify-end gap-2.5 border-t border-ink-100 pt-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

// ── DRAWER LATERAL ─────────────────────────────────────────────────────

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex justify-end bg-black/40 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl animate-slide-in-right"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-100 p-[18px_22px]">
          <div>
            <h2 className="text-[1rem] font-extrabold text-ink-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[0.76rem] text-ink-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-400 transition-all hover:bg-ink-100 hover:text-ink-700"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-[18px_22px]">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2.5 border-t border-ink-100 p-[16px_22px]">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

// ── AVISO / ALERTA ─────────────────────────────────────────────────────

const ALERT_TONES = {
  info: 'bg-info-bg border-info/25 text-info',
  warn: 'bg-warn-bg border-warn/25 text-warn',
  danger: 'bg-danger-bg border-danger/25 text-danger',
  success: 'bg-success-bg border-success/25 text-success',
  neutral: 'bg-ink-50 border-ink-200 text-ink-600',
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof ALERT_TONES;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('rounded border-2 px-4 py-3 text-[0.8rem] leading-relaxed', ALERT_TONES[tone], className)}
    >
      {title && <p className="mb-0.5 font-bold">{title}</p>}
      <div className="[&_a]:underline">{children}</div>
    </div>
  );
}

// ── ABAS ───────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            'rounded-full border-2 px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all',
            value === tab.value
              ? 'border-brand bg-brand text-white'
              : 'border-ink-200 text-ink-600 hover:border-brand hover:text-brand',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 opacity-80">({tab.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── BARRA DE PROGRESSO ─────────────────────────────────────────────────

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        className="h-full rounded-full bg-brand transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
