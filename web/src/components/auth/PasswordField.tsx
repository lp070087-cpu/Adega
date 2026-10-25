'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Campo de senha com mostrar/ocultar. Mantém name/autoComplete do formulário original. */
export function PasswordField({ label = 'Senha', name = 'password', autoComplete = 'current-password', placeholder = '••••••••', minLength, hint, error, aside }: { label?: string; name?: string; autoComplete?: string; placeholder?: string; minLength?: number; hint?: string; error?: string; aside?: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const id = `pw-${name}`;
  return (
    <div className="auth-field">
      <div className="auth-label-row"><label htmlFor={id}>{label}</label>{aside}</div>
      <div className="auth-password">
        <input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} required minLength={minLength} aria-invalid={error ? true : undefined} />
        <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={visible}>
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {error ? <p className="auth-field-error">{error}</p> : hint ? <p className="auth-hint">{hint}</p> : null}
    </div>
  );
}
