'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { pickupCodeFromText } from '@/lib/delivery-pickup-code';

export function DeliveryPickupDialog({ cameraFirst, pending, error, onClose, onCollect }: {
  cameraFirst: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCollect: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [camera, setCamera] = useState(cameraFirst);
  const [message, setMessage] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onCollect);
  callback.current = onCollect;

  useEffect(() => {
    if (!camera) return;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped || !video.current) { stop(); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const { default: decode } = await import('jsqr');
        if (stopped) return;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        function scan() {
          if (stopped) return;
          const frame = video.current;
          if (frame?.videoWidth && ctx) {
            const scale = Math.min(1, 640 / Math.max(frame.videoWidth, frame.videoHeight));
            canvas.width = Math.round(frame.videoWidth * scale);
            canvas.height = Math.round(frame.videoHeight * scale);
            ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
            const result = decode(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
            const found = result && pickupCodeFromText(result.data);
            if (found) {
              setCode(found);
              setCamera(false);
              stop();
              callback.current(found);
              return;
            }
          }
          timer = window.setTimeout(scan, 160);
        }
        scan();
      } catch {
        if (!stopped) {
          setMessage('Câmera indisponível. Confira a permissão no celular ou digite o código da ficha.');
          setCamera(false);
        }
        stop();
      }
    })();
    return stop;
  }, [camera]);

  return <Modal open onClose={onClose} title="Confirmar coleta">
    {camera && <video autoPlay muted playsInline ref={video} aria-label="Câmera de leitura do QR Code" className="mb-3 aspect-video w-full rounded-lg bg-ink-900 object-contain" />}
    {message && <p role="status" className="mb-3 text-sm text-ink-600">{message}</p>}
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    {!camera && <Button size="sm" variant="secondary" className="mb-3" disabled={pending} onClick={() => { setMessage(''); setCamera(true); }}><Camera size={17} aria-hidden /> Abrir câmera</Button>}
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); const parsed = pickupCodeFromText(code); if (!parsed || pending) return; setCamera(false); onCollect(parsed); }}>
      <label className="grid gap-1 text-sm font-semibold">
        Código de coleta
        <input className="field-input font-mono uppercase tracking-widest" autoComplete="off" autoCapitalize="characters" placeholder="ABC1D23" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={9} />
      </label>
      <Button type="submit" disabled={pending || !pickupCodeFromText(code)}>{pending ? 'Validando…' : 'Confirmar código'}</Button>
    </form>
  </Modal>;
}
