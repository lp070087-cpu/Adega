'use client';

import { useActionState } from 'react';
import { loginAction, type AuthActionState } from '@/app/actions/auth';
import { Button, Field, Input } from '@/components/ui';

/**
 * Formulário de login. A validação de verdade acontece no servidor —
 * aqui só marcamos o campo com erro quando o servidor devolve.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <form action={formAction} className="mt-6 text-left">
      {state?.error && (
        <p
          role="alert"
          className="mb-4 rounded border-2 border-danger/25 bg-danger-bg px-4 py-3 text-[0.8rem] font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      <Field label="E-mail" required error={state?.field === 'email' ? state.error : undefined}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@estabelecimento.com"
          required
          aria-invalid={state?.field === 'email'}
        />
      </Field>

      <Field label="Senha" required error={state?.field === 'password' ? state.error : undefined}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  );
}
