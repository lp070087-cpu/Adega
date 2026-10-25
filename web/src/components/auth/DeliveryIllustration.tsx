/**
 * Entregador de scooter com a caixa Del Flash. SVG próprio, em tons de azul,
 * para o painel lateral das telas de acesso. Animação leve (rodas e linhas de
 * velocidade) desligada com prefers-reduced-motion no CSS.
 */
export function DeliveryIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="Entregador Del Flash em uma scooter">
      <defs>
        <linearGradient id="df-ill-box" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d9ecff" /></linearGradient>
        <linearGradient id="df-ill-body" x1="0" x2="1"><stop offset="0" stopColor="#0a6c8f" /><stop offset="1" stopColor="#0b1f3a" /></linearGradient>
      </defs>
      <ellipse cx="215" cy="262" rx="170" ry="14" fill="#000" opacity=".18" />
      <g className="df-ill-speed" stroke="#ffffff" strokeLinecap="round" opacity=".55">
        <path d="M24 168h62" strokeWidth="5" /><path d="M8 196h70" strokeWidth="5" /><path d="M36 224h46" strokeWidth="5" />
      </g>
      {/* pino de destino */}
      <g className="df-ill-pin" transform="translate(338 34)">
        <path d="M30 0C13.4 0 0 13.2 0 29.6 0 52 30 78 30 78s30-26 30-48.4C60 13.2 46.6 0 30 0Z" fill="#ffffff" />
        <circle cx="30" cy="29" r="11" fill="#087EA4" />
      </g>
      {/* caixa térmica */}
      <path d="M104 208h92" stroke="#0b1f3a" strokeWidth="8" strokeLinecap="round" />
      <g transform="translate(104 128)">
        <rect width="88" height="76" rx="12" fill="url(#df-ill-box)" />
        <rect y="20" width="88" height="8" fill="#087EA4" opacity=".18" />
        <path d="M52 34 36 56h12l-6 18 18-25H48l4-15Z" fill="#087EA4" />
      </g>
      {/* scooter */}
      <path d="M118 232h146c12 0 20-8 22-18l8-40h-38l-10 32H150c-14 0-28 8-32 26Z" fill="url(#df-ill-body)" />
      <path d="M286 176l18-68" stroke="#0b1f3a" strokeWidth="9" strokeLinecap="round" />
      <path d="M292 104h30" stroke="#0b1f3a" strokeWidth="9" strokeLinecap="round" />
      <path d="M196 214h70" stroke="#5fb8d9" strokeWidth="6" strokeLinecap="round" opacity=".7" />
      <g className="df-ill-wheel" style={{ transformOrigin: '146px 240px' }}><circle cx="146" cy="240" r="24" fill="#0b1f3a" /><circle cx="146" cy="240" r="10" fill="#cfe7f5" /><path d="M146 222v36M128 240h36" stroke="#0b1f3a" strokeWidth="3" /></g>
      <g className="df-ill-wheel" style={{ transformOrigin: '300px 240px' }}><circle cx="300" cy="240" r="24" fill="#0b1f3a" /><circle cx="300" cy="240" r="10" fill="#cfe7f5" /><path d="M300 222v36M282 240h36" stroke="#0b1f3a" strokeWidth="3" /></g>
      {/* entregador */}
      <path d="M206 170c-4-30 10-56 36-62l14 4c14 6 20 22 16 38l-8 32h-48Z" fill="#ffffff" />
      <path d="M220 182h44l-6 24h-30Z" fill="#0b1f3a" />
      <path d="M262 132l30-10" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" />
      <path d="M232 204l-12 26" stroke="#0b1f3a" strokeWidth="14" strokeLinecap="round" />
      <circle cx="252" cy="82" r="26" fill="#087EA4" />
      <path d="M228 80a24 24 0 0 1 48 0Z" fill="#0b1f3a" />
      <rect x="252" y="74" width="26" height="12" rx="6" fill="#bfe3f3" />
    </svg>
  );
}
