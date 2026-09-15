'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signIn, signOut } from '@/lib/auth';
import { driverLoginSchema, loginSchema, registerSchema } from '@/lib/validations/auth';

/**
 * Ações de autenticação.
 * Toda validação roda no servidor antes de qualquer escrita.
 */

export type AuthActionState = { error?: string; field?: string } | undefined;

export async function loginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  try {
    await signIn('credentials', {
      login: parsed.data.email,
      password: parsed.data.password,
      redirectTo: '/app',
    });
    return undefined;
  } catch (error) {
    // O NextAuth usa throw para redirecionar — não é erro.
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        // Mensagem genérica de propósito: dizer "e-mail não existe"
        // entregaria a lista de clientes para quem fica tentando.
        return { error: 'E-mail ou senha incorretos.' };
      }
      return { error: 'Não foi possível entrar. Tente novamente.' };
    }
    throw error;
  }
}

/**
 * Login da Área do Entregador.
 *
 * Aceita e-mail OU nome de usuário (um único campo `login`) e redireciona
 * para /entregador. É uma ação separada da do painel só por dois motivos:
 * o destino pós-login e a mensagem de erro, que aqui fala em "acesso"
 * para não entregar dica de que o identificador é e-mail.
 */
export async function driverLoginAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = driverLoginSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  try {
    await signIn('credentials', {
      login: parsed.data.login,
      password: parsed.data.password,
      redirectTo: '/entregador',
    });
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === 'CredentialsSignin') {
        return { error: 'Acesso ou senha incorretos.' };
      }
      return { error: 'Não foi possível entrar. Tente novamente.' };
    }
    throw error;
  }
}

export async function registerAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return { error: first?.message ?? 'Dados inválidos.', field: first?.path[0] as string };
  }

  const { name, email, phone, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    return { error: 'Este e-mail já está cadastrado.', field: 'email' };
  }

  const passwordHash = await hashPassword(password);

  // Usuário nasce SEM organização: é o onboarding que cria a loja.
  // Sem o vínculo, o login cai direto no fluxo de configuração.
  await prisma.user.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      passwordHash,
    },
  });

  try {
    await signIn('credentials', {
      login: email,
      password,
      redirectTo: '/onboarding',
    });
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Conta criada, mas não foi possível entrar. Faça login.' };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/login' });
}

/** Troca de senha do usuário logado. */
export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (next.length < 8) return { error: 'A nova senha precisa ter ao menos 8 caracteres.' };
  if (next !== confirm) return { error: 'As senhas não conferem.', field: 'confirmPassword' };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return { error: 'Usuário não encontrado.' };

  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) return { error: 'Senha atual incorreta.', field: 'currentPassword' };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  return { error: undefined };
}
