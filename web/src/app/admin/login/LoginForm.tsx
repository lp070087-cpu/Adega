'use client';
import { useActionState } from 'react';
import { adminLoginAction } from './action';
export function LoginForm(){const [state,run,pending]=useActionState(adminLoginAction,{error:''});return <form action={run}><label>E-mail<input name="email" type="email" required autoComplete="username"/></label><label>Senha<input name="password" type="password" required autoComplete="current-password"/></label>{state.error&&<div role="alert" className="platform-error">{state.error}</div>}<button disabled={pending}>{pending?'Entrando…':'Entrar na administração'}</button></form>;}
