'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessType } from '@prisma/client';
import { cn, formatBRL } from '@/lib/utils';
import { initialsFromName } from '@/data/business-copy';
import { BUSINESS_TYPES } from '@/data/business-templates';
import {
  RESTAURANT_STYLES,
  suggestedCategoriesFor,
  type RestaurantStyle,
  type SuggestedCategory,
} from '@/data/global-catalog';
import {
  defaultSchedule,
  normalizeSchedule,
  summarizeSchedule,
  WEEKDAY_LABELS,
  type WeekdaySchedule,
} from '@/lib/schedule';
import {
  checkSlugAction,
  completeOnboardingV3Action,
  getLibraryFiltersAction,
  saveOnboardingDraftAction,
  searchLibraryAction,
  type OnboardingV3State,
} from '@/app/actions/onboarding-v3';
import { Alert, Badge, Button, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — 10 passos (Fase 3)
 * -----------------------------------------------------------------------
 *   1  Tipo do estabelecimento
 *   2  Dados do estabelecimento
 *   3  Identidade visual
 *   4  Categorias
 *   5  Produtos da biblioteca (sem cadastro manual — só no painel)
 *   6  Preços
 *   7  Entrega
 *   8  Horários
 *   9  Revisão
 *   10 Concluído
 *
 * QUEM GRAVA É O SERVIDOR. Este componente monta o formulário e nada mais:
 * nenhum preço é calculado aqui, nenhum slug é decidido aqui, nenhum id de
 * produto é validado aqui. Tudo é reconferido em completeOnboardingV3Action,
 * que também resolve o slug colidido e recusa imagem base64.
 *
 * NÃO PERDER DADOS ENTRE ETAPAS (3.1): todo o estado vive neste componente
 * — voltar e avançar não desmonta nada. E cada "Continuar" grava um
 * rascunho no banco (3.19), então fechar o navegador não custa o cadastro.
 *
 * Este arquivo é a referência visual do wizard v2: mesmas cores, mesmos
 * campos, mesmos componentes de @/components/ui.
 * ═══════════════════════════════════════════════════════════════════════
 */

const STEPS = [
  { id: 1, label: 'Tipo', icon: '🏪' },
  { id: 2, label: 'Dados', icon: '📋' },
  { id: 3, label: 'Identidade', icon: '🎨' },
  { id: 4, label: 'Categorias', icon: '🗂️' },
  { id: 5, label: 'Produtos', icon: '🏷️' },
  { id: 6, label: 'Preços', icon: '💰' },
  { id: 7, label: 'Entrega', icon: '🛵' },
  { id: 8, label: 'Horários', icon: '🕐' },
  { id: 9, label: 'Revisão', icon: '🔎' },
  { id: 10, label: 'Pronto', icon: '✅' },
] as const;

const LAST_STEP = 10;

type LibraryProduct = {
  id: string;
  name: string;
  brand: string | null;
  emoji: string | null;
  defaultImageUrl: string | null;
  volume: number | null;
  unit: string | null;
  suggestedPrice: number | null;
  globalCategory: { name: string; slug: string; icon: string | null } | null;
};

type OwnProduct = {
  name: string;
  categoryName: string;
  description: string;
  imageUrl: string;
  unit: string;
  price: number;
  stock: number;
  active: boolean;
};

type DeliveryTier = { upToKm: number; fee: number };

/** Tudo o que o wizard guarda. Um objeto só, para o rascunho ser fiel. */
type Draft = {
  businessType: BusinessType | null;
  restaurantStyle: RestaurantStyle | null;
  name: string;
  responsibleName: string;
  phone: string;
  whatsapp: string;
  email: string;
  document: string;
  description: string;
  zipCode: string;
  address: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  state: string;
  slug: string;
  brandColor: string;
  secondaryColor: string;
  accentColor: string;
  theme: 'LIGHT' | 'DARK' | 'AUTO';
  logoUrl: string;
  categories: SuggestedCategory[];
  selected: string[];
  ownProducts: OwnProduct[];
  prices: Record<string, string>;
  allowPickup: boolean;
  allowOwnDelivery: boolean;
  allowMarketplace: boolean;
  deliveryRadius: string;
  baseDeliveryFee: string;
  extraKmFee: string;
  minimumOrder: string;
  averageDeliveryTime: string;
  deliveryTiers: DeliveryTier[];
  schedule: WeekdaySchedule[];
};

const INITIAL: Draft = {
  businessType: null,
  restaurantStyle: null,
  name: '',
  responsibleName: '',
  phone: '',
  whatsapp: '',
  email: '',
  document: '',
  description: '',
  zipCode: '',
  address: '',
  addressNumber: '',
  addressComplement: '',
  district: '',
  city: '',
  state: '',
  slug: '',
  brandColor: '#F15A24',
  secondaryColor: '',
  accentColor: '',
  theme: 'AUTO',
  logoUrl: '',
  categories: [],
  selected: [],
  ownProducts: [],
  prices: {},
  allowPickup: true,
  allowOwnDelivery: true,
  allowMarketplace: false,
  deliveryRadius: '8',
  baseDeliveryFee: '0',
  extraKmFee: '0',
  minimumOrder: '0',
  averageDeliveryTime: '30',
  deliveryTiers: [],
  schedule: defaultSchedule(),
};

export function OnboardingWizardV3({
  userName,
  userEmail,
  resume,
}: {
  userName: string;
  userEmail: string;
  /** Rascunho do banco. Presente = o lojista já tinha começado. */
  resume: { step: number; draft: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // O rascunho do banco é aplicado UMA vez, na montagem. Depois disso o
  // estado da tela manda — reaplicar a cada render apagaria o que a pessoa
  // digita.
  const [draft, setDraft] = useState<Draft>(() => ({
    ...INITIAL,
    ...(resume?.draft as Partial<Draft> | undefined),
    schedule: normalizeSchedule(
      (resume?.draft as Partial<Draft> | undefined)?.schedule ?? defaultSchedule(),
    ),
  }));

  const [step, setStep] = useState(resume?.step ?? 1);
  const [error, setError] = useState<OnboardingV3State>(undefined);
  const [done, setDone] = useState<{ slug: string; created: number } | null>(null);

  // ── biblioteca ──
  const [library, setLibrary] = useState<LibraryProduct[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFilters, setLibraryFilters] = useState<{
    categories: Array<{ name: string; slug: string; count: number }>;
    brands: string[];
  }>({ categories: [], brands: [] });
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [brand, setBrand] = useState('');
  const [onlyRecommended, setOnlyRecommended] = useState(true);
  const [libraryNote, setLibraryNote] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState('');
  const [slugInfo, setSlugInfo] = useState<{ slug: string; available: boolean; suggestion?: string } | null>(null);

  const patch = useCallback((values: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...values }));
  }, []);

  // ── carregar biblioteca e filtros ao entrar no passo 5 ──
  useEffect(() => {
    if (step !== 5) return;
    let alive = true;

    (async () => {
      setLibraryLoading(true);
      const [filters, result] = await Promise.all([
        getLibraryFiltersAction(),
        searchLibraryAction({
          search: search || undefined,
          categorySlug: categorySlug || undefined,
          brand: brand || undefined,
          businessType: onlyRecommended && draft.businessType ? draft.businessType : undefined,
        }),
      ]);
      if (!alive) return;

      if (filters.ok && filters.categories) {
        setLibraryFilters({ categories: filters.categories, brands: filters.brands ?? [] });
      }

      if (result.ok && result.items) {
        setLibrary(result.items as LibraryProduct[]);
        // 3.9: mostrar SÓ o que existe de verdade. Acervo vazio não é erro
        // — é uma biblioteca que ainda está sendo montada, e a tela diz
        // isso em vez de fingir que há produtos.
        setLibraryNote(
          result.total === 0
            ? onlyRecommended
              ? 'Nenhum produto da biblioteca para este segmento ainda. Você pode buscar em todos os produtos.'
              : 'Nenhum produto encontrado com esses filtros.'
            : null,
        );
      } else {
        setLibrary([]);
        setLibraryNote('Não foi possível carregar a biblioteca agora. Tente novamente em instantes.');
      }
      setLibraryLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, search, categorySlug, brand, onlyRecommended]);

  // ── sugestão de slug (passo 3.5) ──
  useEffect(() => {
    if (step !== 2 || !draft.name.trim()) return;
    const timer = setTimeout(async () => {
      const result = await checkSlugAction(draft.slug || draft.name);
      if (result.ok && result.slug) {
        setSlugInfo({
          slug: result.slug,
          available: Boolean(result.available),
          suggestion: result.suggestion,
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [step, draft.name, draft.slug]);

  // Sugestões do segmento já com o estilo aplicado. A regra de merge vive
  // em suggestedCategoriesFor, compartilhada com o servidor.
  const suggested = useMemo(
    () => suggestedCategoriesFor(draft.businessType, draft.restaurantStyle),
    [draft.businessType, draft.restaurantStyle],
  );

  const chosenNames = useMemo(() => new Set(draft.categories.map((c) => c.name)), [draft.categories]);

  const selectedProducts = useMemo(
    () => library.filter((p) => draft.selected.includes(p.id)),
    [library, draft.selected],
  );

  const hasCatalog = draft.selected.length > 0 || draft.ownProducts.length > 0;
  const storeUrl = slugInfo?.slug ? `sualoja.com.br/loja/${slugInfo.slug}` : '—';

  // ── validação de avanço (a barreira real é o servidor) ──
  function blockReason(target: number): string | null {
    if (target === 1 && !draft.businessType) return 'Escolha o tipo do estabelecimento.';
    if (target === 2) {
      if (draft.name.trim().length < 2) return 'Informe o nome do estabelecimento.';
      if (!draft.phone.trim()) return 'Informe um telefone de contato.';
    }
    if (target === 4 && draft.categories.length === 0) {
      return 'Escolha ao menos uma categoria.';
    }
    if (target === 5 && !hasCatalog) {
      return 'Escolha ao menos um produto da biblioteca.';
    }
    if (target === 7 && !draft.allowPickup && !draft.allowOwnDelivery && !draft.allowMarketplace) {
      return 'Habilite ao menos uma forma de atendimento.';
    }
    return null;
  }

  function goNext() {
    const reason = blockReason(step);
    if (reason) {
      setError({ error: reason });
      return;
    }
    setError(undefined);
    const next = Math.min(LAST_STEP, step + 1);
    setStep(next);
    // 3.19 — grava o rascunho a cada avanço. Falhar aqui não trava a
    // navegação: a pessoa segue, perde só a retomada.
    if (next < LAST_STEP) {
      startTransition(() => {
        void saveOnboardingDraftAction(next, draft as unknown as Record<string, unknown>);
      });
    }
  }

  function goBack() {
    setError(undefined);
    setStep((s) => Math.max(1, s - 1));
  }

  function toggleCategory(category: SuggestedCategory) {
    setDraft((current) => {
      const exists = current.categories.some((c) => c.name === category.name);
      return {
        ...current,
        categories: exists
          ? current.categories.filter((c) => c.name !== category.name)
          : [...current.categories, category],
      };
    });
  }

  function addCustomCategory() {
    const name = newCategory.trim();
    if (name.length < 2) return;
    if (draft.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setNewCategory('');
      return;
    }
    // Formato de SuggestedCategory: nome, emoji e `recommended`. A criada
    // à mão não é recomendação de segmento — é escolha do lojista.
    patch({ categories: [...draft.categories, { name, emoji: '📦', recommended: false }] });
    setNewCategory('');
  }

  function toggleSelected(id: string) {
    setDraft((current) => ({
      ...current,
      selected: current.selected.includes(id)
        ? current.selected.filter((x) => x !== id)
        : [...current.selected, id],
    }));
  }

  function submit() {
    const reason = blockReason(5) ?? blockReason(7);
    if (reason) {
      setError({ error: reason });
      return;
    }

    const formData = new FormData();
    formData.set('businessType', draft.businessType ?? '');
    formData.set('restaurantStyle', draft.restaurantStyle ?? '');
    formData.set('name', draft.name.trim());
    formData.set('responsibleName', draft.responsibleName.trim());
    formData.set('phone', draft.phone.trim());
    formData.set('whatsapp', draft.whatsapp.trim());
    formData.set('email', draft.email.trim());
    formData.set('document', draft.document.trim());
    formData.set('description', draft.description.trim());
    formData.set('zipCode', draft.zipCode.trim());
    formData.set('address', draft.address.trim());
    formData.set('addressNumber', draft.addressNumber.trim());
    formData.set('addressComplement', draft.addressComplement.trim());
    formData.set('district', draft.district.trim());
    formData.set('city', draft.city.trim());
    formData.set('state', draft.state.trim());
    formData.set('slug', draft.slug.trim());
    formData.set('brandColor', draft.brandColor);
    formData.set('secondaryColor', draft.secondaryColor);
    formData.set('accentColor', draft.accentColor);
    formData.set('theme', draft.theme);
    formData.set('logoUrl', draft.logoUrl.trim());
    formData.set('minimumOrder', draft.minimumOrder);
    formData.set('baseDeliveryFee', draft.baseDeliveryFee);
    formData.set('extraKmFee', draft.extraKmFee);
    formData.set('deliveryRadius', draft.deliveryRadius);
    formData.set('averageDeliveryTime', draft.averageDeliveryTime);
    formData.set('allowPickup', String(draft.allowPickup));
    formData.set('allowOwnDelivery', String(draft.allowOwnDelivery));
    formData.set('allowMarketplace', String(draft.allowMarketplace));
    formData.set('deliveryTiers', JSON.stringify(draft.deliveryTiers));
    formData.set('schedule', JSON.stringify(draft.schedule));
    formData.set(
      'categories',
      JSON.stringify(draft.categories.map((c) => ({ name: c.name, emoji: c.emoji }))),
    );
    formData.set('globalProductIds', JSON.stringify(draft.selected));
    formData.set('prices', JSON.stringify(numericPrices(draft.prices)));
    formData.set('ownProducts', JSON.stringify(draft.ownProducts));

    startTransition(async () => {
      // A action devolve erro em vez de lançar, mas uma falha de rede
      // rejeita a promessa. Sem este catch a tela ficaria presa em
      // "Finalizando…" — e o lojista acharia que travou o sistema.
      try {
        const result = await completeOnboardingV3Action(undefined, formData);
        if (result?.error) {
          setError(result);
          return;
        }
        if (result?.slug) {
          setDone({ slug: result.slug, created: result.created ?? 0 });
          setStep(LAST_STEP);
        }
      } catch {
        setError({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' });
      }
    });
  }

  // ── passo 10: concluído ──
  if (step === LAST_STEP && done) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-10">
        <div className="rounded-lg border border-ink-100 bg-white p-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-success/10 text-3xl">
            ✅
          </div>
          <h1 className="text-[1.3rem] font-extrabold text-ink-900">Seu estabelecimento está pronto.</h1>
          <p className="mt-2 text-[0.86rem] text-ink-600">
            {draft.name} foi criado com {done.created}{' '}
            {done.created === 1 ? 'produto' : 'produtos'} no catálogo.
          </p>

          <div className="mt-5 rounded border border-ink-100 bg-ink-50 px-4 py-3 text-left">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide text-ink-500">
              Endereço da sua loja
            </p>
            <p className="mt-1 break-all font-mono text-[0.82rem] text-ink-800">
              /loja/{done.slug}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button onClick={() => router.push(`/loja/${done.slug}`)} variant="secondary" fullWidth>
              Ver minha loja
            </Button>
            <Button
              onClick={() => {
                // O JWT ainda não tem organizationId (foi gravado no login).
                // requireOrg lê o vínculo do BANCO, então o painel abre
                // mesmo com o token velho — era aqui que nascia o laço
                // /app ↔ /onboarding.
                router.push('/app/dashboard');
                router.refresh();
              }}
              fullWidth
            >
              Ir para o painel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const current = STEPS[step - 1];

  return (
    <div className="mx-auto max-w-[980px] px-4 pb-24 sm:px-5">
      {/* ── Cabeçalho + progresso ── */}
      <div className="mb-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.05rem] font-extrabold text-ink-900">Configurar estabelecimento</h1>
            <p className="text-[0.78rem] text-ink-500">
              {userName || userEmail} · etapa {step} de {LAST_STEP}
            </p>
          </div>
          <Badge tone="neutral">
            {current?.icon} {current?.label}
          </Badge>
        </div>

        {/* Trilha. Em telas pequenas rola na horizontal em vez de quebrar
            o layout — 10 etapas não cabem lado a lado num celular. */}
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <ol className="flex min-w-max items-center gap-1.5">
            {STEPS.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    // Só volta para etapas já concluídas: avançar por clique
                    // pularia a validação das anteriores.
                    if (s.id < step) {
                      setError(undefined);
                      setStep(s.id);
                    }
                  }}
                  disabled={s.id > step}
                  aria-current={s.id === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold transition-colors',
                    s.id === step && 'bg-brand text-white',
                    s.id < step && 'bg-brand/10 text-brand hover:bg-brand/20',
                    s.id > step && 'bg-ink-100 text-ink-400',
                  )}
                >
                  <span aria-hidden>{s.id < step ? '✓' : s.icon}</span>
                  <span>{s.label}</span>
                </button>
                {s.id < LAST_STEP && <span className="h-px w-3 bg-ink-200" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${Math.round((step / LAST_STEP) * 100)}%` }}
          />
        </div>
      </div>

      {error?.error && (
        <div className="mb-4">
          <Alert tone="danger" title="Não foi possível continuar">
            {error.error}
          </Alert>
        </div>
      )}

      <div className="rounded-lg border border-ink-100 bg-white p-5 sm:p-[22px]">
        {/* ══ 1 — TIPO ══ */}
        {step === 1 && (
          <section>
            <StepTitle title="Que tipo de estabelecimento é?" subtitle="Isso ajusta as sugestões. Você pode vender o que quiser." />
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => patch({ businessType: type, restaurantStyle: null, categories: [] })}
                  className={cn(
                    'flex items-center gap-3 rounded border-2 px-3.5 py-3 text-left transition-all',
                    draft.businessType === type
                      ? 'border-brand bg-brand/5'
                      : 'border-ink-100 hover:border-ink-200',
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {BUSINESS_ICON[type] ?? '🏪'}
                  </span>
                  <span className="text-[0.85rem] font-semibold text-ink-800">
                    {BUSINESS_LABEL[type] ?? type}
                  </span>
                </button>
              ))}
            </div>

            {draft.businessType === 'RESTAURANT' && (
              <div className="mt-5 rounded border border-ink-100 bg-ink-50 p-4">
                <p className="text-[0.82rem] font-bold text-ink-800">Que estilo de comida você faz?</p>
                <p className="mt-0.5 text-[0.74rem] text-ink-500">
                  Serve só para sugerir categorias. Não limita o seu cardápio.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RESTAURANT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() =>
                        patch({
                          restaurantStyle: draft.restaurantStyle === style.value ? null : style.value,
                        })
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold transition-colors',
                        draft.restaurantStyle === style.value
                          ? 'border-brand bg-brand text-white'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                      )}
                    >
                      {style.emoji} {style.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ══ 2 — DADOS ══ */}
        {step === 2 && (
          <section>
            <StepTitle title="Dados do estabelecimento" subtitle="É o que aparece para o seu cliente." />

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Nome do estabelecimento" required>
                <Input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value, slug: '' })}
                  placeholder="Ex.: Burger do Zé"
                  autoFocus
                />
              </Field>
              <Field label="Nome do responsável">
                <Input
                  value={draft.responsibleName}
                  onChange={(e) => patch({ responsibleName: e.target.value })}
                  placeholder="Quem responde pela loja"
                />
              </Field>
              <Field label="Telefone" required>
                <Input
                  value={draft.phone}
                  onChange={(e) => patch({ phone: e.target.value })}
                  placeholder="(11) 3333-4444"
                  inputMode="tel"
                />
              </Field>
              <Field label="WhatsApp" hint="Com DDD. É por onde o pedido chega.">
                <Input
                  value={draft.whatsapp}
                  onChange={(e) => patch({ whatsapp: e.target.value })}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={draft.email}
                  onChange={(e) => patch({ email: e.target.value })}
                  placeholder="contato@sualoja.com.br"
                />
              </Field>
              <Field label="CNPJ ou CPF" hint="Opcional.">
                <Input
                  value={draft.document}
                  onChange={(e) => patch({ document: e.target.value })}
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <Field label="Descrição curta" hint="Uma frase que resuma a loja.">
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Ex.: Hambúrguer artesanal no bairro desde 2015."
                maxLength={400}
              />
            </Field>

            <div className="mt-2 border-t border-ink-100 pt-4">
              <p className="mb-3 text-[0.8rem] font-bold text-ink-800">Endereço</p>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <Field label="CEP">
                  <Input
                    value={draft.zipCode}
                    onChange={(e) => patch({ zipCode: e.target.value })}
                    placeholder="00000-000"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Endereço" className="sm:col-span-2">
                  <Input
                    value={draft.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="Rua, avenida…"
                  />
                </Field>
                <Field label="Número">
                  <Input
                    value={draft.addressNumber}
                    onChange={(e) => patch({ addressNumber: e.target.value })}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Complemento">
                  <Input
                    value={draft.addressComplement}
                    onChange={(e) => patch({ addressComplement: e.target.value })}
                    placeholder="Sala, bloco…"
                  />
                </Field>
                <Field label="Bairro">
                  <Input
                    value={draft.district}
                    onChange={(e) => patch({ district: e.target.value })}
                  />
                </Field>
                <Field label="Cidade" className="sm:col-span-2">
                  <Input value={draft.city} onChange={(e) => patch({ city: e.target.value })} />
                </Field>
                <Field label="Estado">
                  <Input
                    value={draft.state}
                    onChange={(e) => patch({ state: e.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="SP"
                    maxLength={2}
                  />
                </Field>
              </div>
            </div>

            <div className="mt-2 border-t border-ink-100 pt-4">
              <p className="mb-3 text-[0.8rem] font-bold text-ink-800">Endereço público da loja</p>
              <Field
                label="Link"
                hint={
                  slugInfo
                    ? slugInfo.available
                      ? 'Disponível.'
                      : `Já está em uso. Sugerimos: ${slugInfo.suggestion}`
                    : 'Gerado a partir do nome.'
                }
              >
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-[0.78rem] text-ink-500">/loja/</span>
                  <Input
                    value={draft.slug}
                    onChange={(e) => patch({ slug: e.target.value })}
                    placeholder={slugInfo?.slug ?? 'nome-da-loja'}
                  />
                </div>
              </Field>
              <p className="text-[0.72rem] text-ink-500">
                Prévia: <span className="font-mono text-ink-700">{storeUrl}</span>
              </p>
            </div>
          </section>
        )}

        {/* ══ 3 — IDENTIDADE ══ */}
        {step === 3 && (
          <section>
            <StepTitle title="Identidade visual" subtitle="Como a sua loja aparece para o cliente." />

            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div>
                <Field label="Logo" hint="Opcional. Sem logo, usamos as iniciais do nome.">
                  <Input
                    value={draft.logoUrl}
                    onChange={(e) => patch({ logoUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>

                <div className="grid gap-x-4 sm:grid-cols-3">
                  <Field label="Cor principal">
                    <ColorField value={draft.brandColor} onChange={(v) => patch({ brandColor: v })} />
                  </Field>
                  <Field label="Cor secundária">
                    <ColorField
                      value={draft.secondaryColor}
                      onChange={(v) => patch({ secondaryColor: v })}
                    />
                  </Field>
                  <Field label="Cor de destaque">
                    <ColorField value={draft.accentColor} onChange={(v) => patch({ accentColor: v })} />
                  </Field>
                </div>

                <Field label="Tema da loja">
                  <div className="flex flex-wrap gap-2">
                    {(['LIGHT', 'DARK', 'AUTO'] as const).map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => patch({ theme })}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-[0.78rem] font-semibold',
                          draft.theme === theme
                            ? 'border-brand bg-brand text-white'
                            : 'border-ink-200 bg-white text-ink-700',
                        )}
                      >
                        {theme === 'LIGHT' ? '☀️ Claro' : theme === 'DARK' ? '🌙 Escuro' : '🔄 Automático'}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Prévia simples (3.7): logo, nome, botão e um cartão de produto. */}
              <div className="rounded border border-ink-100 bg-ink-50 p-4">
                <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-wide text-ink-500">
                  Prévia
                </p>
                <div
                  className={cn(
                    'overflow-hidden rounded border border-ink-100',
                    draft.theme === 'DARK' ? 'bg-ink-900' : 'bg-white',
                  )}
                >
                  <div className="flex items-center gap-2.5 p-3.5">
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[0.82rem] font-extrabold text-white"
                      style={{ background: draft.brandColor }}
                    >
                      {initialsFromName(draft.name)}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate text-[0.86rem] font-bold',
                          draft.theme === 'DARK' ? 'text-white' : 'text-ink-900',
                        )}
                      >
                        {draft.name || 'Sua loja'}
                      </p>
                      <p className="truncate text-[0.7rem] text-ink-500">
                        {draft.description || 'Descrição curta'}
                      </p>
                    </div>
                  </div>

                  <div className="px-3.5 pb-3.5">
                    <div
                      className={cn(
                        'rounded border p-2.5',
                        draft.theme === 'DARK' ? 'border-ink-700' : 'border-ink-100',
                      )}
                    >
                      <p className={cn('text-[0.78rem] font-semibold', draft.theme === 'DARK' ? 'text-ink-100' : 'text-ink-800')}>
                        Produto de exemplo
                      </p>
                      <p className="text-[0.74rem] font-bold" style={{ color: draft.brandColor }}>
                        R$ 24,90
                      </p>
                    </div>
                    <button
                      type="button"
                      className="mt-2.5 w-full rounded px-3 py-2 text-[0.78rem] font-bold text-white"
                      style={{ background: draft.accentColor || draft.brandColor }}
                    >
                      Peça agora
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ══ 4 — CATEGORIAS ══ */}
        {step === 4 && (
          <section>
            <StepTitle
              title="Categorias do seu catálogo"
              subtitle="Sugeridas para o seu segmento. Marque, desmarque ou crie as suas."
            />

            {suggested.length === 0 ? (
              <p className="text-[0.84rem] text-ink-500">
                Sem sugestões para este segmento. Crie as categorias que precisar abaixo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggested.map((category) => (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={cn(
                      'rounded-full border px-3.5 py-2 text-[0.8rem] font-semibold transition-colors',
                      chosenNames.has(category.name)
                        ? 'border-brand bg-brand text-white'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300',
                    )}
                  >
                    {category.emoji} {category.name}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-ink-100 pt-4">
              <p className="mb-2 text-[0.8rem] font-bold text-ink-800">Criar categoria</p>
              <div className="flex gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomCategory();
                    }
                  }}
                  placeholder="Ex.: Sobremesas"
                />
                <Button type="button" variant="secondary" onClick={addCustomCategory}>
                  Adicionar
                </Button>
              </div>

              {draft.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.categories.map((category) => (
                    <span
                      key={category.name}
                      className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-[0.76rem] font-semibold text-brand"
                    >
                      {category.name}
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        aria-label={`Remover ${category.name}`}
                        className="text-brand/70 hover:text-brand"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ══ 5 — PRODUTOS ══ */}
        {step === 5 && (
          <section>
            <StepTitle
              title="Produtos do seu catálogo"
              subtitle="Escolha da biblioteca da plataforma. Cadastro manual fica para o painel."
            />

            <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto…"
                aria-label="Buscar produto na biblioteca"
              />
              <Select
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                aria-label="Filtrar por categoria"
              >
                <option value="">Todas as categorias</option>
                {libraryFilters.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </Select>
              <Select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Filtrar por marca">
                <option value="">Todas as marcas</option>
                {libraryFilters.brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <label className="flex cursor-pointer items-center gap-2 text-[0.8rem] text-ink-700">
                <input
                  type="checkbox"
                  checked={onlyRecommended}
                  onChange={(e) => setOnlyRecommended(e.target.checked)}
                  className="h-4 w-4 accent-[var(--orange)]"
                />
                Só do meu segmento
              </label>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.78rem] text-ink-500">
                {library.length} {library.length === 1 ? 'produto' : 'produtos'} ·{' '}
                <strong className="text-ink-800">{draft.selected.length} selecionados</strong>
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    patch({ selected: Array.from(new Set([...draft.selected, ...library.map((p) => p.id)])) })
                  }
                  disabled={library.length === 0}
                >
                  Selecionar os {library.length} filtrados
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => patch({ selected: [] })}
                  disabled={draft.selected.length === 0}
                >
                  Limpar seleção
                </Button>
              </div>
            </div>

            {libraryLoading ? (
              <p className="py-8 text-center text-[0.84rem] text-ink-500">Carregando biblioteca…</p>
            ) : library.length === 0 ? (
              <div className="rounded border border-ink-100 bg-ink-50 px-4 py-6 text-center">
                <p className="text-[0.84rem] text-ink-600">{libraryNote}</p>
              </div>
            ) : (
              <div className="grid max-h-[420px] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {library.map((product) => {
                  const isSelected = draft.selected.includes(product.id);
                  return (
                    <label
                      key={product.id}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded border-2 p-2.5 transition-all',
                        isSelected ? 'border-brand bg-brand/5' : 'border-ink-100 hover:border-ink-200',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(product.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--orange)]"
                      />
                      <div className="flex min-w-0 flex-1 gap-2.5">
                        <Thumb product={product} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.8rem] font-semibold text-ink-800">
                            {product.name}
                          </p>
                          <p className="truncate text-[0.7rem] text-ink-500">
                            {[product.brand, product.globalCategory?.name, product.volume]
                              .filter(Boolean)
                              .join(' · ') || 'Sem detalhes'}
                          </p>
                          <p className="mt-0.5 text-[0.74rem] font-bold text-ink-700">
                            {product.suggestedPrice === null
                              ? 'defina o preço'
                              : formatBRL(product.suggestedPrice)}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* 3.10 — ajuste rápido de preço, sem sair do passo. O preço
                pertence ao estabelecimento: o valor da biblioteca é só
                sugestão e não é alterado por ninguém. */}
            {selectedProducts.length > 0 && (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <p className="mb-2 text-[0.8rem] font-bold text-ink-800">
                  Ajuste rápido de preço ({selectedProducts.length})
                </p>
                <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                  {selectedProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink-700">
                        {product.name}
                      </span>
                      <div className="w-[110px] shrink-0">
                        <MoneyInput
                          value={draft.prices[product.id] ?? ''}
                          onChange={(e) =>
                            patch({
                              prices: { ...draft.prices, [product.id]: e.target.value },
                            })
                          }
                          placeholder={
                            product.suggestedPrice === null
                              ? '0,00'
                              : product.suggestedPrice.toFixed(2).replace('.', ',')
                          }
                          aria-label={`Preço de ${product.name}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ══ 6 — PREÇOS ══ */}
        {step === 6 && (
          <section>
            <StepTitle
              title="Preços"
              subtitle="O preço é do seu estabelecimento. Edite o que quiser — o valor da biblioteca não muda."
            />

            {selectedProducts.length === 0 ? (
              <p className="text-[0.84rem] text-ink-500">
                Nenhum produto da biblioteca selecionado. Volte ao passo anterior e escolha os itens.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      patch({
                        prices: Object.fromEntries(
                          selectedProducts.map((p) => [p.id, String(p.suggestedPrice ?? '')]),
                        ),
                      })
                    }
                  >
                    Usar preços sugeridos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => patch({ prices: {} })}
                  >
                    Limpar
                  </Button>
                  <span className="text-[0.76rem] text-ink-500">
                    Editando {selectedProducts.length} de {selectedProducts.length}
                  </span>
                </div>

                <div className="max-h-[460px] space-y-1.5 overflow-y-auto pr-1">
                  {selectedProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 rounded border border-ink-100 px-3 py-2"
                    >
                      <Thumb product={product} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.82rem] font-semibold text-ink-800">
                          {product.name}
                        </span>
                        <span className="block truncate text-[0.7rem] text-ink-500">
                          {product.brand ?? product.globalCategory?.name ?? '—'}
                        </span>
                      </span>
                      <div className="w-[120px] shrink-0">
                        <MoneyInput
                          value={draft.prices[product.id] ?? ''}
                          onChange={(e) =>
                            patch({ prices: { ...draft.prices, [product.id]: e.target.value } })
                          }
                          placeholder={
                            product.suggestedPrice === null
                              ? 'obrigatório'
                              : product.suggestedPrice.toFixed(2).replace('.', ',')
                          }
                          aria-label={`Preço de ${product.name}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* ══ 7 — ENTREGA ══ */}
        {step === 7 && (
          <section>
            <StepTitle title="Como o cliente recebe o pedido?" subtitle="Marque o que a sua loja oferece." />

            <div className="flex flex-col gap-2.5">
              <Modality
                checked={draft.allowPickup}
                onChange={(v) => patch({ allowPickup: v })}
                emoji="🏬"
                title="Retirada no local"
                description="O cliente busca o pedido na loja."
              />
              <Modality
                checked={draft.allowOwnDelivery}
                onChange={(v) => patch({ allowOwnDelivery: v })}
                emoji="🛵"
                title="Entrega própria"
                description="Sua loja entrega com entregador próprio."
              />
              <Modality
                checked={draft.allowMarketplace}
                onChange={(v) => patch({ allowMarketplace: v })}
                emoji="📱"
                title="Delivery por aplicativo"
                description="Integração com iFood, 99Food e similares."
                warning="Ainda não está integrado. Deixamos a opção preparada, mas nenhum pedido entra por aqui enquanto a integração não existir."
              />
            </div>

            {draft.allowOwnDelivery && (
              <div className="mt-5 border-t border-ink-100 pt-4">
                <p className="mb-3 text-[0.8rem] font-bold text-ink-800">Condições de entrega</p>
                <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Raio de entrega (km)">
                    <Input
                      value={draft.deliveryRadius}
                      onChange={(e) => patch({ deliveryRadius: e.target.value })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Taxa base">
                    <MoneyInput
                      value={draft.baseDeliveryFee}
                      onChange={(e) => patch({ baseDeliveryFee: e.target.value })}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Valor por km adicional">
                    <MoneyInput
                      value={draft.extraKmFee}
                      onChange={(e) => patch({ extraKmFee: e.target.value })}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Pedido mínimo">
                    <MoneyInput
                      value={draft.minimumOrder}
                      onChange={(e) => patch({ minimumOrder: e.target.value })}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Tempo médio (min)">
                    <Input
                      value={draft.averageDeliveryTime}
                      onChange={(e) => patch({ averageDeliveryTime: e.target.value })}
                      inputMode="numeric"
                    />
                  </Field>
                </div>

                <div className="mt-2 border-t border-ink-100 pt-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[0.8rem] font-bold text-ink-800">Faixas por distância</p>
                      <p className="text-[0.72rem] text-ink-500">
                        Opcional. A taxa base acima vale quando não há faixa para a distância.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        patch({
                          deliveryTiers: [...draft.deliveryTiers, { upToKm: 3, fee: 0 }],
                        })
                      }
                    >
                      + Adicionar faixa
                    </Button>
                  </div>

                  {draft.deliveryTiers.length === 0 ? (
                    <p className="text-[0.78rem] text-ink-400">Nenhuma faixa configurada.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {draft.deliveryTiers.map((tier, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-[0.78rem] text-ink-600">Até</span>
                          <div className="w-[90px]">
                            <Input
                              value={String(tier.upToKm)}
                              onChange={(e) =>
                                patch({
                                  deliveryTiers: draft.deliveryTiers.map((t, i) =>
                                    i === index ? { ...t, upToKm: Number(e.target.value) || 0 } : t,
                                  ),
                                })
                              }
                              inputMode="decimal"
                              aria-label={`Distância máxima da faixa ${index + 1}`}
                            />
                          </div>
                          <span className="text-[0.78rem] text-ink-600">km →</span>
                          <div className="w-[120px]">
                            <MoneyInput
                              value={String(tier.fee)}
                              onChange={(e) =>
                                patch({
                                  deliveryTiers: draft.deliveryTiers.map((t, i) =>
                                    i === index ? { ...t, fee: parseMoney(e.target.value) } : t,
                                  ),
                                })
                              }
                              aria-label={`Taxa da faixa ${index + 1}`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              patch({
                                deliveryTiers: draft.deliveryTiers.filter((_, i) => i !== index),
                              })
                            }
                            aria-label={`Remover faixa ${index + 1}`}
                            className="text-ink-400 hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ══ 8 — HORÁRIOS ══ */}
        {step === 8 && (
          <section>
            <StepTitle
              title="Horários de funcionamento"
              subtitle="Marque os dias fechados e ajuste os horários. Pode haver mais de um período por dia."
            />

            <div className="space-y-2">
              {draft.schedule.map((day, index) => (
                <div key={day.weekday} className="rounded border border-ink-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[0.84rem] font-semibold text-ink-800">
                      {WEEKDAY_LABELS[day.weekday]}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-[0.78rem] text-ink-600">
                        <input
                          type="checkbox"
                          checked={!day.closed}
                          onChange={(e) =>
                            patch({
                              schedule: draft.schedule.map((d, i) =>
                                i === index
                                  ? {
                                      ...d,
                                      closed: !e.target.checked,
                                      periods:
                                        d.periods.length === 0 && e.target.checked
                                          ? [{ open: '18:00', close: '23:00' }]
                                          : d.periods,
                                    }
                                  : d,
                              ),
                            })
                          }
                          className="h-4 w-4 accent-[var(--orange)]"
                        />
                        Aberto
                      </label>
                      {!day.closed && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            patch({
                              schedule: draft.schedule.map((d, i) =>
                                i === index && d.periods.length < 4
                                  ? { ...d, periods: [...d.periods, { open: '18:00', close: '23:00' }] }
                                  : d,
                              ),
                            })
                          }
                        >
                          + Período
                        </Button>
                      )}
                    </div>
                  </div>

                  {!day.closed && (
                    <div className="mt-2.5 space-y-1.5">
                      {day.periods.length === 0 ? (
                        <p className="text-[0.76rem] text-ink-400">
                          Sem período definido — este dia conta como fechado.
                        </p>
                      ) : (
                        day.periods.map((period, pIndex) => (
                          <div key={pIndex} className="flex flex-wrap items-center gap-2">
                            <input
                              type="time"
                              value={period.open}
                              onChange={(e) =>
                                patch({
                                  schedule: draft.schedule.map((d, i) =>
                                    i === index
                                      ? {
                                          ...d,
                                          periods: d.periods.map((p, j) =>
                                            j === pIndex ? { ...p, open: e.target.value } : p,
                                          ),
                                        }
                                      : d,
                                  ),
                                })
                              }
                              aria-label={`Abertura ${WEEKDAY_LABELS[day.weekday]}`}
                              className="field-input w-[120px]"
                            />
                            <span className="text-[0.78rem] text-ink-500">às</span>
                            <input
                              type="time"
                              value={period.close}
                              onChange={(e) =>
                                patch({
                                  schedule: draft.schedule.map((d, i) =>
                                    i === index
                                      ? {
                                          ...d,
                                          periods: d.periods.map((p, j) =>
                                            j === pIndex ? { ...p, close: e.target.value } : p,
                                          ),
                                        }
                                      : d,
                                  ),
                                })
                              }
                              aria-label={`Fechamento ${WEEKDAY_LABELS[day.weekday]}`}
                              className="field-input w-[120px]"
                            />
                            {day.periods.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  patch({
                                    schedule: draft.schedule.map((d, i) =>
                                      i === index
                                        ? { ...d, periods: d.periods.filter((_, j) => j !== pIndex) }
                                        : d,
                                    ),
                                  })
                                }
                                aria-label="Remover período"
                                className="text-ink-400 hover:text-danger"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Alert tone="info" title="Como vai aparecer na loja">
                {summarizeSchedule(draft.schedule) ?? 'Nenhum horário definido.'}
              </Alert>
            </div>
          </section>
        )}

        {/* ══ 9 — REVISÃO ══ */}
        {step === 9 && (
          <section>
            <StepTitle title="Revise antes de finalizar" subtitle="Confira os dados. Você pode voltar e ajustar." />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex items-center gap-3 rounded border border-ink-100 p-3.5">
                {draft.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.logoUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
                <span
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[0.9rem] font-extrabold text-white"
                  style={{ background: draft.brandColor }}
                >
                  {initialsFromName(draft.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[0.92rem] font-bold text-ink-900">
                    {draft.name || 'Sem nome'}
                  </p>
                  <p className="text-[0.76rem] text-ink-500">
                    {BUSINESS_LABEL[draft.businessType ?? ''] ?? '—'}
                    {draft.restaurantStyle
                      ? ` · ${RESTAURANT_STYLES.find((s) => s.value === draft.restaurantStyle)?.label ?? ''}`
                      : ''}
                  </p>
                </div>
              </div>

              <ReviewBlock title="Endereço">
                {[draft.address, draft.addressNumber].filter(Boolean).join(', ') || 'Não informado'}
                {draft.district ? ` · ${draft.district}` : ''}
                <br />
                {[draft.city, draft.state].filter(Boolean).join(' - ') || 'Cidade não informada'}
              </ReviewBlock>

              <ReviewBlock title="Contato">
                {draft.phone || 'Telefone não informado'}
                {draft.whatsapp ? ` · WhatsApp ${draft.whatsapp}` : ''}
              </ReviewBlock>

              <ReviewBlock title="Categorias">
                {draft.categories.length === 0
                  ? 'Nenhuma'
                  : draft.categories.map((c) => c.name).join(', ')}
              </ReviewBlock>

              <ReviewBlock title="Produtos">
                <strong>{draft.selected.length}</strong>{' '}
                {draft.selected.length === 1 ? 'produto da biblioteca' : 'produtos da biblioteca'} no
                catálogo
              </ReviewBlock>

              <ReviewBlock title="Atendimento">
                {[
                  draft.allowPickup ? 'Retirada' : null,
                  draft.allowOwnDelivery ? 'Entrega própria' : null,
                  draft.allowMarketplace ? 'Delivery por app' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Nenhum'}
                {draft.allowOwnDelivery && (
                  <>
                    <br />
                    Raio {draft.deliveryRadius} km · taxa base R$ {draft.baseDeliveryFee || '0'} ·
                    mínimo R$ {draft.minimumOrder || '0'} · {draft.averageDeliveryTime} min
                  </>
                )}
              </ReviewBlock>

              <ReviewBlock title="Horários">
                {summarizeSchedule(draft.schedule) ?? 'Nenhum horário definido'}
              </ReviewBlock>

              <ReviewBlock title="Endereço da loja">
                <span className="break-all font-mono text-[0.78rem]">{storeUrl}</span>
              </ReviewBlock>
            </div>
          </section>
        )}
      </div>

      {/* ── Navegação ── */}
      {step < LAST_STEP && (
        <div className="sticky bottom-0 z-10 mt-4 flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-white/95 px-4 py-3 backdrop-blur">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 1 || pending}>
            Voltar
          </Button>
          <span className="hidden text-[0.74rem] text-ink-400 sm:block">
            {pending ? 'Salvando…' : `Etapa ${step} de ${LAST_STEP}`}
          </span>
          {step === LAST_STEP - 1 ? (
            <Button type="button" onClick={submit} loading={pending}>
              Finalizar configuração
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={pending}>
              Continuar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── auxiliares ─────────────────────────────────────────────────────────

function StepTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[0.98rem] font-bold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[0.78rem] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-ink-100 p-3.5">
      <p className="mb-1 text-[0.7rem] font-bold uppercase tracking-wide text-ink-500">{title}</p>
      <p className="text-[0.82rem] leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}

function Modality({
  checked,
  onChange,
  emoji,
  title,
  description,
  warning,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  emoji: string;
  title: string;
  description: string;
  warning?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded border-2 p-3.5 transition-all',
        checked ? 'border-brand bg-brand/5' : 'border-ink-100 hover:border-ink-200',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--orange)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.86rem] font-semibold text-ink-800">
          {emoji} {title}
        </span>
        <span className="block text-[0.76rem] text-ink-500">{description}</span>
        {warning && <span className="mt-1 block text-[0.72rem] text-ink-400">{warning}</span>}
      </span>
    </label>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#F15A24'}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Escolher cor"
        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-ink-200 bg-white p-0.5"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#F15A24"
        maxLength={7}
        className="font-mono text-[0.78rem]"
      />
    </div>
  );
}

/**
 * Imagem do produto da biblioteca.
 *
 * A foto NÃO é copiada para a loja: `defaultImageUrl` é um caminho único,
 * compartilhado. Se o acervo ainda não tem arquivo para o item, cai no
 * emoji — e não inventamos imagem para preencher a tela (3.9).
 */
function Thumb({ product, size = 'md' }: { product: LibraryProduct; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const box = size === 'sm' ? 'h-8 w-8 text-[0.9rem]' : 'h-10 w-10 text-[1.1rem]';

  if (!product.defaultImageUrl || failed) {
    return (
      <span className={cn('grid shrink-0 place-items-center rounded bg-ink-50', box)} aria-hidden>
        {product.emoji ?? '📦'}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.defaultImageUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded object-cover', box)}
    />
  );
}

/** "24,90" → 24.9. O servidor revalida; isto é só conveniência de digitação. */
function parseMoney(value: string): number {
  const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Só os preços realmente digitados. Vazio = usar o sugerido. */
function numericPrices(prices: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, raw] of Object.entries(prices)) {
    if (!raw || !String(raw).trim()) continue;
    const value = parseMoney(raw);
    if (value > 0) out[id] = value;
  }
  return out;
}

const BUSINESS_LABEL: Record<string, string> = {
  BEVERAGE: 'Bebidas',
  BURGER: 'Hamburgueria',
  SNACK_BAR: 'Lanchonete',
  PIZZA: 'Pizzaria',
  ACAI: 'Açaí',
  RESTAURANT: 'Restaurante',
  CONVENIENCE: 'Conveniência',
  BAKERY: 'Padaria',
  MARKET: 'Mercado',
  DARK_KITCHEN: 'Cozinha industrial',
};

const BUSINESS_ICON: Record<string, string> = {
  BEVERAGE: '🍺',
  BURGER: '🍔',
  SNACK_BAR: '🌭',
  PIZZA: '🍕',
  ACAI: '🍧',
  RESTAURANT: '🍽️',
  CONVENIENCE: '🏪',
  BAKERY: '🥐',
  MARKET: '🛒',
  DARK_KITCHEN: '👨‍🍳',
};
