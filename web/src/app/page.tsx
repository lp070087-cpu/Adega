import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

/**
 * Raiz: encaminha para onde o usuário realmente precisa estar.
 * Sem sessão → login. Com sessão e sem loja → onboarding. Com loja → painel.
 */
export default async function Home() {
  const session = await auth();

  if (!session?.user?.id) redirect('/login');
  if (!session.user.organizationId) redirect('/onboarding');
  redirect('/app/dashboard');
}
