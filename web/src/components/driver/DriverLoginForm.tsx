'use client';

import { startTransition, useActionState, useState } from 'react';
import { driverLoginAction, type AuthActionState } from '@/app/actions/auth';
import { Button, Field, Input } from '@/components/ui';
import {Eye,EyeOff} from 'lucide-react';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ÁREA DO ENTREGADOR — login
 * -----------------------------------------------------------------------
 * Um único campo de identificação: e-mail OU nome de usuário.
 *
 * A loja entra por /login com e-mail; o entregador criado na OPÇÃO B não
 * tem e-mail — ele entra aqui com o username. O `authorize` decide a
 * consulta pelo conteúdo (e-mail → findUnique por email; senão, por
 * username). Nada de "se tem @ é e-mail" escondido no cliente.
 *
 * O botão de 👁 no campo de senha é só acessibilidade de digitação:
 * mostrar/esconder o que está sendo digitado. A senha viaja e é guardada
 * como hash — nunca em texto puro (ver src/lib/auth/password.ts).
 * ═══════════════════════════════════════════════════════════════════════
 */
export function DriverLoginForm({store,onFirstAccess}:{store?:string;onFirstAccess:()=>void}) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    driverLoginAction,
    undefined,
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); startTransition(() => formAction(data)); }} className="mt-6 text-left">
      {store&&<input type="hidden" name="store" value={store}/>}
      {state?.error && (
        <p
          role="alert"
          className="mb-4 rounded border-2 border-danger/25 bg-danger-bg px-4 py-3 text-[0.8rem] font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      <Field
        label="E-mail"
        required
        error={state?.field === 'login' ? state.error : undefined}
      >
        <Input
          name="login"
          aria-label="E-mail"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="voce@email.com"
          required
          
          aria-invalid={state?.field === 'login'}
        />
      </Field>

      <Field label="Senha" required error={state?.field === 'password' ? state.error : undefined}>
        <div className="relative">
          <Input
            name="password"
            aria-label="Senha"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[0.9rem] text-ink-400 hover:text-ink-600"
          >
            {showPassword ? <EyeOff size={18}/>:<Eye size={18}/>}
          </button>
        </div>
      </Field>

      <label className="mb-4 flex min-h-11 items-center gap-2 text-sm"><input name="remember" type="checkbox" defaultChecked className="h-5 w-5"/>Manter conectado</label>
      <Button type="submit" size="lg" fullWidth loading={pending} className="mt-2">
        {pending ? 'Entrando...' : 'Entrar'}
      </Button>
      <div className="mt-3 flex justify-center text-sm font-semibold text-brand"><button type="button" onClick={onFirstAccess} className="inline-flex min-h-11 items-center text-center">Primeiro acesso ou esqueci minha senha</button></div>
    </form>
  );
}
