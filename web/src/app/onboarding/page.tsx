import { requireOnboardingUser } from '@/lib/auth/guards';
import { getOnboardingDraft } from '@/lib/data/onboarding';
import { OnboardingWizardV3 } from './OnboardingWizardV3';

export const metadata = { title: 'Configurar estabelecimento' };

/**
 * Onboarding em 10 passos (Fase 3).
 *
 * A página confirma a sessão no servidor (requireOnboardingUser) e entrega
 * o assistente ao cliente. Cada passo é revalidado no servidor quando o
 * formulário final é enviado — o assistente é conveniência de navegação,
 * não a barreira de validação.
 *
 * O RASCUNHO é lido AQUI, no servidor, com o id da sessão. O cliente recebe
 * o conteúdo pronto e não tem como pedir o rascunho de outra pessoa: não
 * existe parâmetro para isso em lugar nenhum.
 *
 * Os assistentes anteriores continuam no projeto como referência visual
 * (OnboardingWizard.tsx, 5 passos; OnboardingWizardV2.tsx, 6 passos). Nenhum
 * dos dois é usado por esta rota.
 */
export default async function OnboardingPage() {
  const user = await requireOnboardingUser();
  const resume = await getOnboardingDraft(user.id);

  return (
    <main className="min-h-screen bg-ink-50 py-7">
      <OnboardingWizardV3
        userName={user.name}
        userEmail={user.email}
        // Só o que a tela precisa. `step` fora da faixa é ignorado pelo
        // wizard, que normaliza a agenda e ignora campos desconhecidos.
        resume={resume ? { step: resume.step, draft: resume.draft } : null}
      />
    </main>
  );
}
