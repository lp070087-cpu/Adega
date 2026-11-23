'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BrandMark } from '@/components/ui/BrandMark';
import { DRIVER_MOTO_SRC } from './driver-moto';

type Phase = 'loading' | 'playing' | 'done';

export function DriverLoginIntro({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const moto = useRef<HTMLImageElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const auth = useRef<HTMLDivElement>(null);

  function start() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(current => current === 'loading' ? 'playing' : current);
    }
  }

  function finish(restoreFocus = false) {
    setPhase('done');
    if (restoreFocus) requestAnimationFrame(() => auth.current?.focus());
  }

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => { if (reducedMotion.matches) setPhase('done'); };
    onMotionChange();
    reducedMotion.addEventListener('change', onMotionChange);
    if (!reducedMotion.matches) {
      if (moto.current?.complete && moto.current.naturalWidth > 0) start();
      skip.current?.focus({ preventScroll: true });
    }
    return () => reducedMotion.removeEventListener('change', onMotionChange);
  }, []);

  useEffect(() => {
    if (phase === 'done') return;
    const timeout = window.setTimeout(() => setPhase('done'), phase === 'loading' ? 3500 : 3000);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  async function playSkid() {
    let audio: AudioContext | undefined;
    try {
      audio = new AudioContext();
      await audio.resume();
      const sample = audio.createBuffer(1, Math.round(audio.sampleRate * 0.48), audio.sampleRate);
      const values = sample.getChannelData(0);
      for (let i = 0; i < values.length; i++) values[i] = Math.random() * 2 - 1;
      const sound = audio.createBufferSource();
      sound.buffer = sample;
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, audio.currentTime);
      filter.frequency.exponentialRampToValueAtTime(3600, audio.currentTime + 0.32);
      filter.Q.value = 5;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.47);
      sound.connect(filter).connect(gain).connect(audio.destination);
      sound.onended = () => { void audio?.close(); };
      sound.start();
    } catch { void audio?.close().catch(() => undefined); }
  }

  return <>
    <div ref={auth} className="df-driver-login" tabIndex={-1} inert={phase !== 'done'}>
      {children}
    </div>
    {phase !== 'done' && (
      <div className="df-driver-intro" data-phase={phase} role="dialog" aria-modal="true" aria-label="Abertura Del Flash Entregador" onKeyDown={event => { if (event.key === 'Escape') finish(true); }}>
        <div className="df-driver-intro-brand"><BrandMark /></div>
        <div className="df-driver-track" aria-hidden="true">
          <div className="df-driver-smoke"><i /><i /><i /></div>
          <div className="df-driver-bike" onAnimationEnd={event => { if (event.target === event.currentTarget) finish(true); }}>
            <div className="df-driver-moto-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img ref={moto} src={DRIVER_MOTO_SRC} alt="" width={736} height={736} fetchPriority="high" onLoad={start} onError={() => finish(true)} />
            </div>
          </div>
        </div>
        <div className="df-driver-intro-controls">
          <button type="button" className="df-driver-intro-action" onClick={() => void playSkid()}>Ouvir arrancada</button>
          <button ref={skip} type="button" className="df-driver-intro-action" onClick={() => finish(true)}>Pular abertura</button>
        </div>
      </div>
    )}
  </>;
}
