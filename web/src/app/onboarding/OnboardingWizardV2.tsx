'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessType } from '@prisma/client';
import { cn, formatBRL, slugify } from '@/lib/utils';
import { BUSINESS_TEMPLATES, BUSINESS_TYPES } from '@/data/business-templates';
import { copyByType } from '@/data/business-copy';
import {
  RESTAURANT_STYLES,
  SEGMENT_CATEGORIES,
  suggestedCategories,
  styleExtraCategories,
  type RestaurantStyle,
  type SuggestedCategory,
} from '@/data/global-catalog';
import { searchGlobalProductsAction } from '@/app/actions/global-catalog';
import { completeOnboardingV2Action, type OnboardingV2State } from '@/app/actions/onboarding-v2';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  MoneyInput,
  Textarea,
} from '@/components/ui';
import { ProductThumb } from '@/components/catalog/ProductThumb';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — 6 passos
 * -----------------------------------------------------------------------
 *   1. Tipo do estabelecimento (+ estilo, se restaurante)
 *   2. Nome, logo e identidade
 *   3. Categorias que o lojista trabalha
 *   4. Produtos da biblioteca da plataforma
 *   5. Preços
 *   6. Entrega e finalização
 *
 * O assistente só MONTA o formulário. Quem grava é a server action, que
 * revalida tudo — inclusive cada preço e cada id de produto global.
 * ═══════════════════════════════════════════════════════════════════════
 */

const STEPS = [
  { id: 1, label: 'Tipo', icon: '🏪' },
  { id: 2, label: 'Identidade', icon: '🎨' },
  { id: 3, label: 'Categorias', icon: '🗂️' },
  { id: 4, label: 'Produtos', icon: '🏷️' },
  { id: 5, label: 'Preços', icon: '💰' },
  { id: 6, label: 'Finalizar', icon: '✅' },
] as const;

type LibraryProduct = {
  id: string;
  name: string;
  brand: string | null;
  emoji: string | null;
  defaultImageUrl: string | null;
  volume: number | null;
  unit: string | null;
  packSize: number;
  suggestedPrice: number | null;
  globalCategory: { name: string; slug: string; icon: string | null } | null;
};

type OwnProduct = {
  name: string;
  categoryName: string;
  emoji: string;
  price: number;
};

export function OnboardingWizardV2({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<OnboardingV2State>(undefined);

  // ── 1 ──
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [restaurantStyle, setRestaurantStyle] = useState<RestaurantStyle | null>(null);

  // ── 2 ──
  const [name, setName] = useState('');
  const [brandColor, setBrandColor] = useState('#F15A24');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // ── 3 ──
  // Só nomes: o emoji vem da sugestão quando existe, e é reenviado junto.
  const [chosenCategories, setChosenCategories] = useState<Set<string>>(new Set());
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');

  // ── 4 ──
  const [library, setLibrary] = useState<LibraryProduct[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ownProducts, setOwnProducts] = useState<OwnProduct[]>([]);
  const [ownOpen, setOwnOpen] = useState(false);
  const [ownDraft, setOwnDraft] = useState<OwnProduct>({
    name: '',
    categoryName: '',
    emoji: '⭐',
    price: 0,
  });

  // ── 5 ──
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [ownPrices, setOwnPrices] = useState<Record<number, string>>({});

  // ── 6 ──
  const [minimumOrder, setMinimumOrder] = useState('0');
  const [baseDeliveryFee, setBaseDeliveryFee] = useState('0');
  const [extraKmFee, setExtraKmFee] = useState('0');
  const [deliveryRadius, setDeliveryRadius] = useState('8');
  const [averageDeliveryTime, setAverageDeliveryTime] = useState('30');
  const [openingHours, setOpeningHours] = useState('Seg a Dom, 18h às 23h30');

  const [done, setDone] = useState<{ slug: string; total: number } | null>(null);

  const copy = copyByType(businessType);
  const template = businessType ? BUSINESS_TEMPLATES[businessType] : null;

  /** Sugestões do segmento, já com o estilo do restaurante aplicado. */
  const suggestions: SuggestedCategory[] = useMemo(() => {
    if (!businessType) return [];
    const base = suggestedCategories(businessType);
    if (businessType !== 'RESTAURANT' || !restaurantStyle) return base;

    const extra = styleExtraCategories(restaurantStyle);
    const seen = new Set(base.map((c) => c.name));
    const merged = [...base];
    for (const item of extra) {
      if (seen.has(item.name)) continue;
      merged.push(item);
      seen.add(item.name);
    }
    return merged;
  }, [businessType, restaurantStyle]);

  const emojiByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of suggestions) map.set(item.name, item.emoji);
    for (const item of SEGMENT_CATEGORIES[businessType ?? 'SNACK_BAR'] ?? []) {
      if (!map.has(item.name)) map.set(item.name, item.emoji);
    }
    return map;
  }, [suggestions, businessType]);

  const allCategoryNames = useMemo(() => {
    const known = (SEGMENT_CATEGORIES[businessType ?? 'SNACK_BAR'] ?? []).map((c) => c.name);
    const extra = Array.from(chosenCategories).filter((n) => !known.includes(n));
    return [...known, ...extra, ...extraCategories.filter((n) => !chosenCategories.has(n))];
  }, [businessType, chosenCategories, extraCategories]);

  // ── passos ────────────────────────────────────────────────────────────

  function goToStep2() {
    if (!businessType) {
      setError({ error: 'Escolha o tipo do estabelecimento para continuar.' });
      return;
    }
    setError(undefined);

    // Pré-seleção: as categorias que já vêm recomendadas para o segmento.
    if (chosenCategories.size === 0) {
      const recommended = suggestedCategories(businessType)
        .filter((c) => c.recommended)
        .map((c) => c.name);
      setChosenCategories(new Set(recommended));
    }
    if (template) setBrandColor(template.brandColor);
    setStep(2);
  }

  function goToStep3() {
    if (name.trim().length < 2) {
      setError({ error: 'Informe o nome do estabelecimento.', field: 'name' });
      return;
    }
    const logo = logoUrl.trim();
    if (logo && !/^https?:\/\//i.test(logo)) {
      setError({ error: 'A logo precisa ser uma URL pública (http ou https).', field: 'logoUrl' });
      return;
    }
    if (logo.startsWith('data:')) {
      setError({
        error: 'Imagem em base64 não é aceita como solução final. Use a URL pública.',
        field: 'logoUrl',
      });
      return;
    }
    setError(undefined);
    setStep(3);
  }

  function goToStep4() {
    if (chosenCategories.size === 0) {
      setError({ error: 'Escolha ao menos uma categoria.' });
      return;
    }
    setError(undefined);
    setStep(4);
    if (library.length === 0) void loadLibrary();
  }

  // ── biblioteca ────────────────────────────────────────────────────────

  async function loadLibrary(search = librarySearch, categorySlug = libraryCategory) {
    setLibraryLoading(true);
    const result = await searchGlobalProductsAction({
      search: search || undefined,
      categorySlug: categorySlug || undefined,
      businessType: businessType ?? undefined,
      page: 1,
    });
    if (result.ok && result.data) {
      setLibrary(result.data.items as unknown as LibraryProduct[]);
    } else if (!result.ok) {
      setError({ error: result.error });
    }
    setLibraryLoading(false);
  }

  function toggleLibraryProduct(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of library) next.add(item.id);
      return next;
    });
  }

  function addOwnProduct() {
    if (ownDraft.name.trim().length < 2) {
      setError({ error: 'Dê um nome ao produto próprio.' });
      return;
    }
    setOwnProducts((current) => [...current, { ...ownDraft, name: ownDraft.name.trim() }]);
    setOwnDraft({ name: '', categoryName: '', emoji: '⭐', price: 0 });
    setOwnOpen(false);
    setError(undefined);
  }

  // ── finalização ───────────────────────────────────────────────────────

  const chosenGlobalProducts = useMemo(
    () => library.filter((p) => selected.has(p.id)),
    [library, selected],
  );

  const totalItems = selected.size + ownProducts.length;

  function finalize() {
    setError(undefined);
    if (totalItems === 0) {
      setError({ error: 'Escolha ao menos um produto ou crie um produto próprio.' });
      return;
    }

    // Preço digitado; vazio ou inválido cai no sugerido do produto global.
    const priceMap: Record<string, number> = {};
    for (const product of chosenGlobalProducts) {
      const raw = prices[product.id];
      if (raw === undefined || !raw.trim()) continue;
      const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
      const value = Number(normalized);
      if (Number.isFinite(value) && value >= 0) priceMap[product.id] = value;
    }

    const own = ownProducts.map((product, index) => {
      const raw = ownPrices[index];
      const normalized =
        raw && raw.trim()
          ? raw.includes(',')
            ? raw.replace(/\./g, '').replace(',', '.')
            : raw
          : String(product.price);
      const value = Number(normalized);
      return {
        ...product,
        price: Number.isFinite(value) && value >= 0 ? value : product.price,
      };
    });

    const formData = new FormData();
    formData.set('businessType', businessType!);
    if (restaurantStyle) formData.set('restaurantStyle', restaurantStyle);
    formData.set('name', name.trim());
    formData.set('brandColor', brandColor);
    formData.set('logoUrl', logoUrl.trim());
    formData.set('description', description.trim());
    formData.set('phone', phone);
    formData.set('whatsapp', whatsapp || phone);
    formData.set('minimumOrder', minimumOrder);
    formData.set('baseDeliveryFee', baseDeliveryFee);
    formData.set('extraKmFee', extraKmFee);
    formData.set('deliveryRadius', deliveryRadius);
    formData.set('averageDeliveryTime', averageDeliveryTime);
    formData.set('openingHours', openingHours);
    formData.set(
      'categories',
      JSON.stringify(
        Array.from(chosenCategories).map((categoryName) => ({
          name: categoryName,
          emoji: emojiByName.get(categoryName),
        })),
      ),
    );
    formData.set('globalProductIds', JSON.stringify(Array.from(selected)));
    formData.set('prices', JSON.stringify(priceMap));
    formData.set('ownProducts', JSON.stringify(own));

    startTransition(async () => {
      const result = await completeOnboardingV2Action(undefined, formData);

      if (result?.error) {
        setError(result);
        return;
      }

      setDone({ slug: result?.slug ?? '', total: result?.created ?? totalItems });
      // A sessão ainda carrega organizationId: null — o refresh reconstrói
      // o JWT já com a loja vinculada.
      router.refresh();
      setTimeout(() => router.push('/app/dashboard'), 1600);
    });
  }

  // ── tela de sucesso ───────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-white p-10 text-center shadow-xl">
        <span className="mb-4 block text-[3rem]">🎉</span>
        <h1 className="text-[1.3rem] font-extrabold text-ink-900">Tudo pronto!</h1>
        <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-500">
          <strong className="text-ink-800">{name}</strong> foi criado com {done.total}{' '}
          {done.total === 1 ? 'produto' : 'produtos'} no catálogo.
        </p>
        {done.slug && (
          <p className="mt-4 rounded border border-dashed border-ink-200 bg-ink-50 px-4 py-3 text-[0.78rem] text-ink-600">
            Endereço da sua loja:{' '}
            <strong className="text-brand">/loja/{done.slug}</strong>
          </p>
        )}
        <p className="mt-5 text-[0.8rem] font-semibold text-ink-500">Entrando no painel...</p>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full w-full animate-pulse-soft rounded-full bg-brand" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4">
      {/* Trilha */}
      <ol className="mb-6 flex flex-wrap items-center justify-center gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[0.74rem] font-semibold transition-all',
                step === s.id
                  ? 'border-brand bg-brand-light text-brand'
                  : step > s.id
                    ? 'border-success/30 bg-success-bg text-success'
                    : 'border-ink-200 bg-white text-ink-400',
              )}
            >
              <span aria-hidden>{step > s.id ? '✓' : s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </span>
            {i < STEPS.length - 1 && <span className="text-ink-300">—</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-white p-6 shadow-lg lg:p-8">
        {error?.error && (
          <Alert tone="danger" className="mb-5">
            {error.error}
          </Alert>
        )}

        {/* ══ PASSO 1 — TIPO ══ */}
        {step === 1 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">
              Que tipo de estabelecimento é o seu?
            </h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Isso define quais categorias e produtos sugerimos. Não limita nada: você pode vender
              o que quiser.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((type) => {
                const t = BUSINESS_TEMPLATES[type];
                const active = businessType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setBusinessType(type);
                      setRestaurantStyle(null);
                      // Trocar de segmento invalida as categorias marcadas.
                      setChosenCategories(new Set());
                    }}
                    className={cn(
                      'rounded-lg border-2 p-4 text-left transition-all',
                      active
                        ? 'border-brand bg-brand-light shadow-sm'
                        : 'border-ink-200 bg-white hover:border-brand/50 hover:shadow-sm',
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-[1.6rem]" aria-hidden>
                        {t.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.9rem] font-bold text-ink-900">
                          {t.label}
                        </span>
                        <span className="block text-[0.72rem] text-ink-500">
                          {suggestedCategories(type).filter((c) => c.recommended).length} categorias
                          sugeridas
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pergunta extra, só para restaurante */}
            {businessType === 'RESTAURANT' && (
              <div className="mt-6 rounded-lg border-2 border-dashed border-ink-200 bg-ink-50 p-5">
                <h3 className="text-[0.92rem] font-bold text-ink-900">
                  Qual é o estilo principal?
                </h3>
                <p className="mt-1 text-[0.78rem] text-ink-500">
                  Isso serve apenas para sugerir produtos e categorias. Não limite o
                  estabelecimento.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {RESTAURANT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => {
                        setRestaurantStyle(style.value);
                        // Estilo redefine a pré-seleção das categorias.
                        const recommended = styleExtraCategories(style.value)
                          .concat(suggestedCategories('RESTAURANT').filter((c) => c.recommended))
                          .map((c) => c.name);
                        setChosenCategories(new Set(recommended));
                      }}
                      className={cn(
                        'rounded-full border-2 px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all',
                        restaurantStyle === style.value
                          ? 'border-brand bg-brand text-white'
                          : 'border-ink-200 bg-white text-ink-600 hover:border-brand hover:text-brand',
                      )}
                    >
                      <span aria-hidden className="mr-1">
                        {style.emoji}
                      </span>
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button size="lg" onClick={goToStep2}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ══ PASSO 2 — IDENTIDADE ══ */}
        {step === 2 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Nome e identidade</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              É o nome que seus clientes vão ver. Não há nome pré-preenchido: a loja é sua.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
              <div>
                <Field
                  label="Nome do estabelecimento"
                  required
                  error={error?.field === 'name' ? error.error : undefined}
                >
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Burger do Zé, Pizzaria Prime, Mercado Central..."
                    maxLength={120}
                    autoFocus
                  />
                </Field>

                <p className="mb-3.5 -mt-1 text-[0.72rem] text-ink-400">
                  Endereço público:{' '}
                  <strong className="text-ink-600">/loja/{slugify(name) || 'sua-loja'}</strong>
                </p>

                <Field label="Descrição" hint={copy.headline}>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    maxLength={400}
                    placeholder={copy.description.slice(0, 90)}
                  />
                </Field>

                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Field label="Telefone">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      inputMode="tel"
                      placeholder="(00) 0000-0000"
                    />
                  </Field>
                  <Field label="WhatsApp" hint="Usado no botão da loja pública.">
                    <Input
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                    />
                  </Field>
                </div>

                <Field
                  label="URL da logo"
                  hint="Opcional. Sem logo, usamos as iniciais do nome."
                  error={error?.field === 'logoUrl' ? error.error : undefined}
                >
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://..."
                    type="url"
                  />
                </Field>

                <Field label="Cor da marca">
                  <div className="flex flex-wrap items-center gap-2">
                    {['#F15A24', '#E11D48', '#7C3AED', '#0EA5E9', '#16A34A', '#F59E0B', '#0F172A'].map(
                      (color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Cor ${color}`}
                          onClick={() => setBrandColor(color)}
                          className={cn(
                            'h-9 w-9 rounded-full border-2 transition-all',
                            brandColor === color ? 'scale-110 border-ink-900' : 'border-transparent',
                          )}
                          style={{ background: color }}
                        />
                      ),
                    )}
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => setBrandColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded-sm border-2 border-ink-200 bg-white"
                      aria-label="Cor personalizada"
                    />
                  </div>
                </Field>
              </div>

              {/* Prévia */}
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
                <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
                  Prévia
                </p>
                <div className="overflow-hidden rounded-lg bg-white shadow-sm">
                  <div className="h-16" style={{ background: brandColor }} />
                  <div className="-mt-7 px-4 pb-4">
                    {logoUrl.trim() ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-14 w-14 rounded-full border-4 border-white object-cover"
                      />
                    ) : (
                      <span
                        className="brand-mark h-14 w-14 rounded-full border-4 border-white text-[1rem]"
                        style={{ background: brandColor }}
                      >
                        {(name.trim() || 'SL').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <p className="mt-2.5 text-[0.96rem] font-extrabold text-ink-900">
                      {name.trim() || 'Seu estabelecimento'}
                    </p>
                    <p className="mt-1 text-[0.76rem] leading-relaxed text-ink-500">
                      {description.trim() || copy.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </Button>
              <Button size="lg" onClick={goToStep3}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ══ PASSO 3 — CATEGORIAS ══ */}
        {step === 3 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">
              Quais categorias você trabalha?
            </h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Já deixamos marcadas as mais comuns para{' '}
              <strong>{template?.label ?? 'o seu segmento'}</strong>. Desmarque o que não vende e
              acrescente o que faltar.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setChosenCategories(new Set(suggestions.map((c) => c.name)))
                }
              >
                Selecionar todas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChosenCategories(new Set())}>
                Limpar seleção
              </Button>
              <span className="ml-auto rounded-full bg-brand-light px-3 py-1 text-[0.76rem] font-bold text-brand">
                {chosenCategories.size} selecionadas
              </span>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((category) => {
                const on = chosenCategories.has(category.name);
                return (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() =>
                      setChosenCategories((current) => {
                        const next = new Set(current);
                        if (next.has(category.name)) next.delete(category.name);
                        else next.add(category.name);
                        return next;
                      })
                    }
                    className={cn(
                      'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
                      on
                        ? 'border-brand bg-brand-light'
                        : 'border-ink-200 bg-white hover:border-brand/40',
                    )}
                  >
                    <span className="text-[1.35rem]" aria-hidden>
                      {category.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-bold text-ink-900">
                        {category.name}
                      </span>
                      {category.recommended && (
                        <span className="text-[0.68rem] font-semibold text-brand">
                          sugerida para o seu segmento
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-[0.66rem] font-bold',
                        on ? 'border-brand bg-brand text-white' : 'border-ink-300 text-transparent',
                      )}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Categorias próprias */}
            <div className="mt-5 rounded-lg border border-ink-200 bg-ink-50 p-4">
              <p className="text-[0.84rem] font-bold text-ink-800">
                Precisa de uma categoria que não está na lista?
              </p>
              <div className="mt-2.5 flex gap-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Ex.: Marmitas, Açaí, Kits..."
                  maxLength={40}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const value = newCategory.trim();
                    if (value.length < 2) return;
                    setExtraCategories((current) =>
                      current.includes(value) ? current : [...current, value],
                    );
                    setChosenCategories((current) => new Set(current).add(value));
                    setNewCategory('');
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const value = newCategory.trim();
                    if (value.length < 2) return;
                    setExtraCategories((current) =>
                      current.includes(value) ? current : [...current, value],
                    );
                    setChosenCategories((current) => new Set(current).add(value));
                    setNewCategory('');
                  }}
                >
                  Adicionar
                </Button>
              </div>

              {extraCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {extraCategories.map((category) => (
                    <span
                      key={category}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-[0.76rem] font-semibold',
                        chosenCategories.has(category)
                          ? 'border-brand bg-white text-brand'
                          : 'border-ink-200 bg-white text-ink-500',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setChosenCategories((current) => {
                            const next = new Set(current);
                            if (next.has(category)) next.delete(category);
                            else next.add(category);
                            return next;
                          })
                        }
                      >
                        {category}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remover ${category}`}
                        onClick={() => {
                          setExtraCategories((current) => current.filter((c) => c !== category));
                          setChosenCategories((current) => {
                            const next = new Set(current);
                            next.delete(category);
                            return next;
                          });
                        }}
                        className="text-ink-400 hover:text-danger"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button size="lg" onClick={goToStep4} disabled={chosenCategories.size === 0}>
                Escolher produtos
              </Button>
            </div>
          </>
        )}

        {/* ══ PASSO 4 — PRODUTOS ══ */}
        {step === 4 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">
              Escolha os produtos da biblioteca
            </h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Estes produtos são da plataforma e ficam disponíveis para todos. A imagem é
              compartilhada — a sua loja só cria um arquivo novo se você enviar uma foto própria.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Input
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Buscar produto ou marca…"
                className="max-w-[260px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void loadLibrary();
                  }
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => void loadLibrary()}>
                Buscar
              </Button>
              <Button size="sm" variant="secondary" onClick={selectAllVisible}>
                Selecionar todos
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </Button>
              <span className="ml-auto rounded-full bg-brand-light px-3 py-1 text-[0.76rem] font-bold text-brand">
                {selected.size} selecionados
              </span>
            </div>

            <div className="mt-4 max-h-[400px] overflow-y-auto rounded-lg border border-ink-200">
              {libraryLoading ? (
                <p className="px-4 py-10 text-center text-[0.82rem] text-ink-400">
                  Carregando a biblioteca…
                </p>
              ) : library.length === 0 ? (
                <p className="px-4 py-10 text-center text-[0.82rem] text-ink-500">
                  Nenhum produto encontrado. A biblioteca ainda pode estar sendo montada — use
                  &quot;Criar produto próprio&quot; abaixo.
                </p>
              ) : (
                library.map((product) => {
                  const on = selected.has(product.id);
                  return (
                    <label
                      key={product.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 border-b border-ink-100 px-4 py-3 transition-all last:border-b-0',
                        on ? 'bg-brand-light/40' : 'bg-white hover:bg-ink-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleLibraryProduct(product.id)}
                        className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
                      />
                      <ProductThumb
                        globalImageUrl={product.defaultImageUrl}
                        emoji={product.emoji}
                        alt={product.name}
                        size={40}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.86rem] font-semibold text-ink-800">
                          {product.name}
                        </span>
                        <span className="block text-[0.72rem] text-ink-400">
                          {[product.brand, product.globalCategory?.name]
                            .filter(Boolean)
                            .join(' · ')}
                          {product.volume ? ` · ${product.volume}${product.unit ?? ''}` : ''}
                        </span>
                      </span>
                      {product.suggestedPrice !== null && (
                        <span className="text-[0.8rem] font-semibold text-ink-500">
                          {formatBRL(product.suggestedPrice)}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            {/* Produto próprio */}
            <div className="mt-5 rounded-lg border border-ink-200 bg-ink-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[0.86rem] font-bold text-ink-800">
                    Tem um produto que não está na biblioteca?
                  </p>
                  <p className="text-[0.76rem] text-ink-500">
                    Você não é obrigado a usar só a biblioteca.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setOwnOpen((v) => !v)}>
                  + Criar produto próprio
                </Button>
              </div>

              {ownOpen && (
                <div className="mt-3 grid gap-3 rounded border border-ink-200 bg-white p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Field label="Nome" className="mb-0">
                    <Input
                      value={ownDraft.name}
                      onChange={(e) => setOwnDraft({ ...ownDraft, name: e.target.value })}
                      placeholder="Ex.: Marmita P"
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Categoria" className="mb-0">
                    <Input
                      value={ownDraft.categoryName}
                      onChange={(e) => setOwnDraft({ ...ownDraft, categoryName: e.target.value })}
                      placeholder="Ex.: Pratos"
                      list="categorias-conhecidas"
                      maxLength={40}
                    />
                    <datalist id="categorias-conhecidas">
                      {allCategoryNames.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Preço" className="mb-0">
                    <MoneyInput
                      value={String(ownDraft.price || '')}
                      onChange={(e) =>
                        setOwnDraft({ ...ownDraft, price: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button onClick={addOwnProduct}>Adicionar</Button>
                  </div>
                </div>
              )}

              {ownProducts.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {ownProducts.map((product, index) => (
                    <li
                      key={`${product.name}-${index}`}
                      className="flex items-center gap-2 rounded border border-ink-200 bg-white px-3 py-2 text-[0.8rem]"
                    >
                      <span aria-hidden>⭐</span>
                      <span className="flex-1 truncate font-semibold text-ink-800">
                        {product.name}
                      </span>
                      <span className="text-ink-500">{product.categoryName || 'Meus produtos'}</span>
                      <button
                        type="button"
                        aria-label={`Remover ${product.name}`}
                        onClick={() =>
                          setOwnProducts((current) => current.filter((_, i) => i !== index))
                        }
                        className="text-ink-400 hover:text-danger"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button size="lg" onClick={() => setStep(5)} disabled={totalItems === 0}>
                Informar preços
              </Button>
            </div>
          </>
        )}

        {/* ══ PASSO 5 — PREÇOS ══ */}
        {step === 5 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Agora informe seus preços</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Os valores ao lado são apenas sugestões de mercado. Deixe em branco para usar a
              sugestão — você pode ajustar tudo depois, item por item, no Catálogo.
            </p>

            <div className="mt-5 max-h-[420px] overflow-y-auto rounded-lg border border-ink-200">
              {chosenGlobalProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center gap-3 border-b border-ink-100 px-4 py-2.5 last:border-b-0"
                >
                  <ProductThumb
                    globalImageUrl={product.defaultImageUrl}
                    emoji={product.emoji}
                    alt={product.name}
                    size={34}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.84rem] font-semibold text-ink-800">
                      {product.name}
                    </span>
                    <span className="block text-[0.7rem] text-ink-400">
                      {product.globalCategory?.name ?? 'Sem categoria'}
                    </span>
                  </span>
                  {product.suggestedPrice !== null && (
                    <span className="text-[0.72rem] text-ink-400">
                      sugerido {formatBRL(product.suggestedPrice)}
                    </span>
                  )}
                  <div className="w-[120px] flex-shrink-0">
                    <MoneyInput
                      value={prices[product.id] ?? ''}
                      placeholder={
                        product.suggestedPrice !== null
                          ? String(product.suggestedPrice).replace('.', ',')
                          : '0,00'
                      }
                      onChange={(e) =>
                        setPrices((current) => ({ ...current, [product.id]: e.target.value }))
                      }
                      aria-label={`Preço de ${product.name}`}
                      className="!py-1.5 text-[0.8rem]"
                    />
                  </div>
                </div>
              ))}

              {ownProducts.map((product, index) => (
                <div
                  key={`own-${product.name}-${index}`}
                  className="flex items-center gap-3 border-b border-ink-100 bg-ink-50 px-4 py-2.5 last:border-b-0"
                >
                  <span className="flex h-[34px] w-[34px] items-center justify-center text-[1.1rem]" aria-hidden>
                    ⭐
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.84rem] font-semibold text-ink-800">
                      {product.name}
                    </span>
                    <span className="block text-[0.7rem] text-ink-400">
                      produto próprio · {product.categoryName || 'Meus produtos'}
                    </span>
                  </span>
                  <div className="w-[120px] flex-shrink-0">
                    <MoneyInput
                      value={ownPrices[index] ?? ''}
                      placeholder={String(product.price || 0).replace('.', ',')}
                      onChange={(e) =>
                        setOwnPrices((current) => ({ ...current, [index]: e.target.value }))
                      }
                      aria-label={`Preço de ${product.name}`}
                      className="!py-1.5 text-[0.8rem]"
                    />
                  </div>
                </div>
              ))}
            </div>

            <Alert tone="neutral" className="mt-4">
              Produto sem preço informado entra com o valor sugerido. Estoque entra zerado — saldo
              só existe com movimentação registrada.
            </Alert>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)}>
                Voltar
              </Button>
              <Button size="lg" onClick={() => setStep(6)}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ══ PASSO 6 — FINALIZAÇÃO ══ */}
        {step === 6 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Entrega e finalização</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Regras de entrega da sua loja. Você pode ajustar isso a qualquer momento em Minha Loja.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <Field label="Pedido mínimo">
                    <MoneyInput
                      value={minimumOrder}
                      onChange={(e) => setMinimumOrder(e.target.value)}
                    />
                  </Field>
                  <Field label="Taxa de entrega base">
                    <MoneyInput
                      value={baseDeliveryFee}
                      onChange={(e) => setBaseDeliveryFee(e.target.value)}
                    />
                  </Field>
                  <Field label="Valor por km adicional">
                    <MoneyInput
                      value={extraKmFee}
                      onChange={(e) => setExtraKmFee(e.target.value)}
                    />
                  </Field>
                  <Field label="Raio de entrega (km)">
                    <Input
                      value={deliveryRadius}
                      onChange={(e) => setDeliveryRadius(e.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Tempo médio de entrega (min)">
                    <Input
                      value={averageDeliveryTime}
                      onChange={(e) => setAverageDeliveryTime(e.target.value)}
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Horário de funcionamento">
                    <Input
                      value={openingHours}
                      onChange={(e) => setOpeningHours(e.target.value)}
                      placeholder="Seg a Dom, 18h às 23h30"
                    />
                  </Field>
                </div>

                <Alert tone="neutral" className="mt-2">
                  O cálculo de frete por distância depende das coordenadas da loja e do endereço do
                  cliente. Configure em <strong>Minha Loja</strong> depois — sem elas, a plataforma
                  avisa que o frete é estimado e não inventa valores.
                </Alert>
              </div>

              <div className="rounded-lg border border-ink-200 bg-ink-50 p-5">
                <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
                  Resumo
                </p>

                <dl className="space-y-2.5 text-[0.84rem]">
                  <Row label="Responsável" value={userName} />
                  <Row label="Acesso" value={userEmail} />
                  <Row label="Segmento" value={template?.label ?? '—'} />
                  {restaurantStyle && (
                    <Row
                      label="Estilo"
                      value={
                        RESTAURANT_STYLES.find((s) => s.value === restaurantStyle)?.label ?? '—'
                      }
                    />
                  )}
                  <Row label="Estabelecimento" value={name || '—'} />
                  <Row label="Endereço da loja" value={`/loja/${slugify(name) || '...'}`} />
                  <Row label="Categorias" value={`${chosenCategories.size}`} />
                  <Row
                    label="Produtos"
                    value={`${selected.size} da biblioteca${
                      ownProducts.length ? ` + ${ownProducts.length} próprio(s)` : ''
                    }`}
                  />
                  <Row label="Sua função" value="Proprietário" />
                </dl>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-200 pt-3">
                  {Array.from(chosenCategories)
                    .slice(0, 8)
                    .map((category) => (
                      <Badge key={category} tone="neutral">
                        {category}
                      </Badge>
                    ))}
                  {chosenCategories.size > 8 && (
                    <Badge tone="neutral">+{chosenCategories.size - 8}</Badge>
                  )}
                </div>

                <p className="mt-4 border-t border-ink-200 pt-3 text-[0.72rem] leading-relaxed text-ink-500">
                  Ao finalizar, criamos o estabelecimento, as categorias, o catálogo e um caixa
                  padrão. Tudo numa única transação: se algo falhar, nada fica pela metade.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(5)} disabled={pending}>
                Voltar
              </Button>
              <Button size="lg" onClick={finalize} loading={pending}>
                {pending ? 'Criando estabelecimento...' : 'Criar estabelecimento'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-ink-800">{value}</dd>
    </div>
  );
}
