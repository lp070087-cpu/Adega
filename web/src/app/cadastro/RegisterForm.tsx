'use client';

import { useActionState } from 'react';
import { registerAction, type AuthActionState } from '@/app/actions/auth';
import { Button, Field, Input } from '@/components/ui';

export function RegisterForm() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    registerAction,
    undefined,
  );

  const errorFor = (field: string) => (state?.field === field ? state.error : undefined);

  return (
    <form action={formAction} className="mt-6">
      {state?.error && !state.field && (
        <p
          role="alert"
          className="mb-4 rounded border-2 border-danger/25 bg-danger-bg px-4 py-3 text-[0.8rem] font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      <Field label="Seu nome" required error={errorFor('name')}>
        <Input name="name" autoComplete="name" placeholder="Como devemos te chamar" required />
      </Field>

      <Field label="E-mail" required error={errorFor('email')}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@estabelecimento.com"
          required
        />
      </Field>

      <Field label="Telefone" hint="Opcional — usado para contato da plataforma." error={errorFor('phone')}>
        <Input name="phone" inputMode="tel" placeholder="(00) 00000-0000" />
      </Field>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field
          label="Senha"
          required
          hint="Mínimo 8 caracteres."
          error={errorFor('password')}
        >
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </Field>

        <Field label="Confirmar senha" required error={errorFor('confirmPassword')}>
          <Input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </Field>
      </div>

      <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
        {pending ? 'Criando conta...' : 'Criar conta e continuar'}
      </Button>

      <p className="mt-3 text-center text-[0.72rem] leading-relaxed text-ink-400">
        Sua senha é gravada apenas como hash — nem nós conseguimos lê-la.
      </p>
    </form>
  );
}
