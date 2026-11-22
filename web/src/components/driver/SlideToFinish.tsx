'use client';

import { useRef, useState, type PointerEvent } from 'react';
import { ChevronsRight } from 'lucide-react';

export function SlideToFinish({ disabled, onFinish }: { disabled: boolean; onFinish: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const active = useRef<{ pointer: number; start: number; distance: number } | null>(null);
  const [progress, setProgress] = useState(0);

  function move(event: PointerEvent<HTMLButtonElement>) {
    const drag = active.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    setProgress(Math.max(0, Math.min(drag.distance, event.clientX - drag.start)));
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const drag = active.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    reset();
    if (!disabled && event.clientX - drag.start >= drag.distance * 0.9) onFinish();
  }

  function reset() {
    active.current = null;
    setProgress(0);
  }

  return <div ref={track} className="relative flex h-14 max-w-full select-none items-center justify-center rounded-xl border border-success/25 bg-success/10 pl-12 pr-2 text-center text-sm font-bold text-ink-900">
    <span aria-hidden>Arraste para finalizar</span>
    <button type="button" aria-label="Finalizar entrega. Arraste até o fim ou confirme pelo teclado." disabled={disabled}
      className="absolute left-1 top-1 flex h-12 w-12 touch-none items-center justify-center rounded-lg bg-success text-white disabled:opacity-50"
      style={{ transform: `translateX(${progress}px)` }}
      onPointerDown={(event) => {
        if (disabled || !event.isPrimary || event.button !== 0 || !track.current) return;
        const distance = track.current.clientWidth - event.currentTarget.offsetWidth - 8;
        if (distance < 20) return;
        active.current = { pointer: event.pointerId, start: event.clientX, distance };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={move} onPointerUp={finish} onPointerCancel={reset} onLostPointerCapture={reset}
      onClick={(event) => {
        if (event.detail === 0 && !disabled && window.confirm('Confirmar a conclusão desta entrega?')) onFinish();
      }}>
      <ChevronsRight size={22} aria-hidden />
    </button>
  </div>;
}
