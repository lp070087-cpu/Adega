'use client';

import { useEffect, useState } from 'react';
import { DeliveryIllustration } from '../auth/DeliveryIllustration';

export function DriverLoginIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (sessionStorage.getItem('df-driver-intro') === 'seen') return;
      sessionStorage.setItem('df-driver-intro', 'seen');
    } catch { /* Permite a animação sem preferências persistidas. */ }
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 2000);
    return () => window.clearTimeout(timeout);
  }, []);

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

  if (!visible) return null;
  return <div className="df-driver-intro" role="dialog" aria-modal="true" aria-label="Abertura Del Flash Entregador" onKeyDown={event => { if (event.key === 'Escape') setVisible(false); }}>
    <DeliveryIllustration className="df-driver-intro-art" launch />
    <div className="df-driver-intro-controls">
      <button type="button" className="df-driver-intro-skip" onClick={() => void playSkid()}>Ouvir arrancada</button>
      <button type="button" autoFocus className="df-driver-intro-skip" onClick={() => setVisible(false)}>Pular abertura</button>
    </div>
  </div>;
}
