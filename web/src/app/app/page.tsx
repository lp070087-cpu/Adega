import { redirect } from 'next/navigation';
import { requireOrgPage } from '@/lib/auth/guards';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * /app — ENTRADA DO PAINEL
 * -----------------------------------------------------------------------
 * Esta rota não tem tela: ela existe porque é o destino de tudo que
 * aponta para "o painel" sem saber qual aba abrir — o login depois do
 * acesso, o fim do onboarding, o entregador que entrou com a conta errada
 * e até o middleware quando barra uma área sem permissão.
 *
 * Sem este arquivo o Next devolve 404 nesses cinco caminhos. Redirecionar
 * em vez de desenhar um dashboard aqui também evita duas telas iniciais
 * diferentes: a aba de entrada é /app/dashboard, e só ela.
 * ═══════════════════════════════════════════════════════════════════════
 */
export default async function AppIndexPage() {
  const { role } = await requireOrgPage();
  if (role === 'DRIVER') redirect('/entregador');
  if (role === 'KITCHEN') redirect('/app/pedidos');
  redirect('/app/dashboard');
}
