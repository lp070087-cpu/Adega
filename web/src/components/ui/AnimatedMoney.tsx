'use client';
import * as React from 'react';
import { formatBRL } from '@/lib/utils';

/**
 * Counts up to a money value (R$ 0,00 → R$ 1.250,00) when it first appears
 * and eases between values when it changes. Display only: the real value is
 * always the final frame, is exposed to assistive tech immediately, and a
 * hidden copy of it reserves the width so the layout never jumps.
 * Never use it for stock quantities.
 */
export function AnimatedMoney({ value, duration = 750, className }: { value: number; duration?: number; className?: string }) {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = React.useState(target);
  const from = React.useRef(0);
  const frame = React.useRef<number | null>(null);

  React.useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === target || document.visibilityState === 'hidden') {
      from.current = target;
      setShown(target);
      return;
    }
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      setShown(progress < 1 ? Math.round(current * 100) / 100 : target);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    setShown(start);
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      // An interrupted animation continues from the real value, not a midpoint.
      from.current = target;
    };
  }, [target, duration]);

  return (
    <span className={className} style={{ display: 'inline-grid', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{formatBRL(target)}</span>
      <span aria-hidden style={{ gridArea: '1 / 1', textAlign: 'inherit' }}>{formatBRL(shown)}</span>
      <span className="sr-only">{formatBRL(target)}</span>
    </span>
  );
}
