'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessType } from '@prisma/client';
import { cn, formatBRL, slugify } from '@/lib/utils';
import { BUSINESS_TEMPLATES, BUSINESS_TYPES, templateProductCount } from '@/data/business-templates';
import { copyByType } from '@/data/business-copy';
import {
  completeOnboardingAction,
  type OnboardingState,
} from '@/app/actions/onboarding';
import { Alert, Button, Checkbox, Field, Input, MoneyInput, Textarea } from '@/components/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ONBOARDING — 5 passos
 * -----------------------------------------------------------------------
 *   1. Tipo de negócio
 *   2. Nome e identidade
 *   3. Produtos
 *   4. Preços
 *   5. Finalização
 *
 * O assistente só monta o formulário. Quem grava é a server action, que
 * revalida tudo — inclusive a lista de produtos escolhidos.
 * ═══════════════════════════════════════════════════════════════════════
 */

const STEPS = [
  { id: 1, label: 'Tipo de negócio', icon: '🏪' },
  { id: 2, label: 'Nome e identidade', icon: '🎨' },
  { id: 3, label: 'Produtos', icon: '🏷️' },
  { id: 4, label: 'Preços', icon: '💰' },
  { id: 5, label: 'Finalização', icon: '✅' },
] as const;

export function OnboardingWizard({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<OnboardingState>(undefined);

  // ── passo 1 ──
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);

  // ── passo 2 ──
  const [name, setName] = useState('');
  const [brandColor, setBrandColor] = useState('#F15A24');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // ── passo 3 ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [created, setCreated] = useState<{ slug: string; displayId: string } | null>(null);

  // ── passo 4 ──
  const [multiplier, setMultiplier] = useState(1);
  const [offset, setOffset] = useState(0);
  const [roundToNinety, setRoundToNinety] = useState(false);

  // ── passo 5 ──
  const [minimumOrder, setMinimumOrder] = useState('0');
  const [baseDeliveryFee, setBaseDeliveryFee] = useState('0');
  const [extraKmFee, setExtraKmFee] = useState('0');
  const [deliveryRadius, setDeliveryRadius] = useState('8');
  const [averageDeliveryTime, setAverageDeliveryTime] = useState('30');
  const [openingHours, setOpeningHours] = useState('Seg a Dom, 18h às 23h30');

  const template = businessType ? BUSINESS_TEMPLATES[businessType] : null;
  const copy = copyByType(businessType);

  /** Produtos do segmento já com o ajuste de preço do passo 4 aplicado. */
  const pricedProducts = useMemo(() => {
    if (!template) return [];
    return template.products.map((p) => {
      let price = p.price * multiplier + offset;
      if (roundToNinety) price = Math.floor(price) + 0.9;
      price = Math.max(0.5, Math.round(price * 100) / 100);
      return { ...p, adjustedPrice: price };
    });
  }, [template, multiplier, offset, roundToNinety]);

  const categories = useMemo(() => {
    if (!template) return [];
    const used = new Set(pricedProducts.map((p) => p.category));
    return template.categories.filter((c) => used.has(c));
  }, [template, pricedProducts]);

  const visibleProducts = useMemo(
    () =>
      categoryFilter === 'all'
        ? pricedProducts
        : pricedProducts.filter((p) => p.category === categoryFilter),
    [pricedProducts, categoryFilter],
  );

  function toggleProduct(productName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productName)) next.delete(productName);
      else next.add(productName);
      return next;
    });
  }

  function selectCategory(category: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of pricedProducts) {
        if (p.category !== category) continue;
        if (on) next.add(p.name);
        else next.delete(p.name);
      }
      return next;
    });
  }

  function goToStep2() {
    if (!businessType) {
      setError({ error: 'Escolha o tipo de negócio para continuar.' });
      return;
    }
    setError(undefined);
    // Sugere o nome do segmento e a cor da marca como ponto de partida.
    if (!name) setName('');
    if (template) setBrandColor(template.brandColor);
    setSelected(new Set(template?.products.map((p) => p.name) ?? []));
    setStep(2);
  }

  function goToStep3() {
    if (name.trim().length < 2) {
      setError({ error: 'Informe o nome do estabelecimento.', field: 'name' });
      return;
    }
    if (logoUrl.trim() && !/^https?:\/\//i.test(logoUrl.trim())) {
      setError({ error: 'A logo precisa ser uma URL pública (http ou https).', field: 'logoUrl' });
      return;
    }
    if (logoUrl.trim().startsWith('data:')) {
      setError({ error: 'Imagem em base64 não é aceita. Use a URL pública da imagem.', field: 'logoUrl' });
      return;
    }
    setError(undefined);
    setStep(3);
  }

  function finalize() {
    setError(undefined);

    if (selected.size === 0) {
      setError({ error: 'Escolha ao menos um produto — ou volte e selecione todos.' });
      return;
    }

    const formData = new FormData();
    formData.set('businessType', businessType!);
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
    for (const productName of selected) formData.append('productNames', productName);

    startTransition(async () => {
      const result = await completeOnboardingAction(undefined, formData);

      if (result?.error) {
        setError(result);
        return;
      }

      // A sessão ainda carrega organizationId: null. Recarregar a página
      // faz o JWT ser reconstruído já com a loja vinculada.
      setCreated({ slug: result?.field ?? '', displayId: '' });
      router.refresh();
      // Um instante para a tela de sucesso aparecer antes de entrar no painel.
      setTimeout(() => router.push('/app/dashboard'), 1400);
    });
  }

  // ── tela de sucesso ──
  if (created) {
    return (
      <div className="mx-auto max-w-lg rounded-xl bg-white p-10 text-center shadow-xl">
        <span className="mb-4 block text-[3rem]">🎉</span>
        <h1 className="text-[1.3rem] font-extrabold text-ink-900">Tudo pronto!</h1>
        <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-500">
          <strong className="text-ink-800">{name}</strong> foi criado com {selected.size}{' '}
          {selected.size === 1 ? 'produto' : 'produtos'} no catálogo.
        </p>
        {created.slug && (
          <p className="mt-4 rounded border border-dashed border-ink-200 bg-ink-50 px-4 py-3 text-[0.78rem] text-ink-600">
            Endereço da sua loja:{' '}
            <strong className="text-brand">/loja/{created.slug}</strong>
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
    <div className="mx-auto max-w-[1080px] px-4">
      {/* Trilha de passos */}
      <ol className="mb-6 flex flex-wrap items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-2 rounded-full border-2 px-3.5 py-1.5 text-[0.76rem] font-semibold transition-all',
                step === s.id
                  ? 'border-brand bg-brand-light text-brand'
                  : step > s.id
                    ? 'border-success/30 bg-success-bg text-success'
                    : 'border-ink-200 bg-white text-ink-400',
              )}
            >
              <span aria-hidden>{step > s.id ? '✓' : s.icon}</span>
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.id}</span>
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

        {/* ── PASSO 1 — TIPO DE NEGÓCIO ─────────────────────────────── */}
        {step === 1 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">
              Que tipo de estabelecimento é o seu?
            </h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Isso define o catálogo sugerido e os textos da sua loja. Você pode mudar depois.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUSINESS_TYPES.map((type) => {
                const t = BUSINESS_TEMPLATES[type];
                const active = businessType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBusinessType(type)}
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
                        <span className="block text-[0.9rem] font-bold text-ink-900">{t.label}</span>
                        <span className="block text-[0.72rem] text-ink-500">
                          {templateProductCount(type)} produtos-modelo
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <Button size="lg" onClick={goToStep2}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ── PASSO 2 — NOME E IDENTIDADE ───────────────────────────── */}
        {step === 2 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Nome e identidade</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              É o nome que seus clientes vão ver. Não há nome pré-preenchido: a loja é sua.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
              <div>
                <Field label="Nome do estabelecimento" required error={error?.field === 'name' ? error.error : undefined}>
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
                            brandColor === color ? 'border-ink-900 scale-110' : 'border-transparent',
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

              {/* Prévia da loja com a identidade escolhida */}
              <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
                <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-wide text-ink-400">
                  Prévia
                </p>
                <div className="overflow-hidden rounded-lg bg-white shadow-sm">
                  <div className="h-16" style={{ background: brandColor }} />
                  <div className="-mt-7 px-4 pb-4">
                    {logoUrl ? (
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

        {/* ── PASSO 3 — PRODUTOS ────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Escolha os produtos</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Partimos do catálogo sugerido para <strong>{template?.label}</strong>. Os itens
              escolhidos são <strong>copiados</strong> para a sua loja — depois disso, editar aqui
              ou lá são coisas independentes.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelected(new Set(pricedProducts.map((p) => p.name)))}
              >
                Selecionar todos ({pricedProducts.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
              <span className="ml-auto rounded-full bg-brand-light px-3 py-1 text-[0.76rem] font-bold text-brand">
                {selected.size} selecionados
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  'rounded-full border-2 px-3.5 py-1.5 text-[0.76rem] font-semibold transition-all',
                  categoryFilter === 'all'
                    ? 'border-brand bg-brand text-white'
                    : 'border-ink-200 text-ink-600 hover:border-brand hover:text-brand',
                )}
              >
                Todas
              </button>
              {categories.map((category) => {
                const inCategory = pricedProducts.filter((p) => p.category === category);
                const allSelected = inCategory.every((p) => selected.has(p.name));
                return (
                  <div key={category} className="flex items-center gap-1 rounded-full border-2 border-ink-200 pr-1">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[0.76rem] font-semibold transition-all',
                        categoryFilter === category ? 'text-brand' : 'text-ink-600 hover:text-brand',
                      )}
                    >
                      {category} ({inCategory.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCategory(category, !allSelected)}
                      title={allSelected ? 'Desmarcar categoria' : 'Marcar categoria'}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[0.7rem] text-ink-400 hover:bg-ink-100 hover:text-brand"
                    >
                      {allSelected ? '−' : '+'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 max-h-[420px] overflow-y-auto rounded-lg border border-ink-200">
              {visibleProducts.map((product) => {
                const on = selected.has(product.name);
                return (
                  <label
                    key={product.name}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-ink-100 px-4 py-3 transition-all last:border-b-0',
                      on ? 'bg-brand-light/40' : 'bg-white hover:bg-ink-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleProduct(product.name)}
                      className="h-4 w-4 cursor-pointer accent-[var(--orange)]"
                    />
                    <span className="text-[1.25rem]" aria-hidden>
                      {product.emoji ?? '🍽️'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-semibold text-ink-800">
                        {product.name}
                      </span>
                      <span className="block text-[0.72rem] text-ink-400">{product.category}</span>
                    </span>
                    <span className="text-[0.86rem] font-bold text-brand">
                      {formatBRL(product.adjustedPrice)}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button size="lg" onClick={() => setStep(4)} disabled={selected.size === 0}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ── PASSO 4 — PREÇOS ──────────────────────────────────────── */}
        {step === 4 && (
          <>
            <h2 className="text-[1.15rem] font-extrabold text-ink-900">Ajuste os preços</h2>
            <p className="mt-1.5 text-[0.84rem] text-ink-500">
              Os valores do catálogo-modelo são uma referência de mercado. Ajuste em bloco agora e
              refine item por item depois, no Catálogo.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
              <div className="space-y-4">
                <Field label={`Multiplicador — ${multiplier.toFixed(2)}×`}>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={multiplier}
                    onChange={(e) => setMultiplier(Number(e.target.value))}
                    className="w-full accent-[var(--orange)]"
                  />
                </Field>

                <Field label="Ajuste fixo por item">
                  <MoneyInput
                    value={String(offset)}
                    onChange={(e) => setOffset(Number(e.target.value) || 0)}
                  />
                </Field>

                <Checkbox
                  label="Arredondar para ,90"
                  checked={roundToNinety}
                  onChange={(e) => setRoundToNinety(e.target.checked)}
                />

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMultiplier(1);
                    setOffset(0);
                    setRoundToNinety(false);
                  }}
                >
                  Restaurar valores originais
                </Button>
              </div>

              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-ink-200">
                {pricedProducts
                  .filter((p) => selected.has(p.name))
                  .map((product) => {
                    const original = template?.products.find((t) => t.name === product.name)?.price ?? 0;
                    const changed = Math.abs(original - product.adjustedPrice) > 0.001;
                    return (
                      <div
                        key={product.name}
                        className="flex items-center gap-3 border-b border-ink-100 px-4 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-[0.84rem] text-ink-700">
                          {product.name}
                        </span>
                        {changed && (
                          <span className="text-[0.74rem] text-ink-400 line-through">
                            {formatBRL(original)}
                          </span>
                        )}
                        <span
                          className={cn(
                            'text-[0.86rem] font-bold',
                            changed ? 'text-brand' : 'text-ink-600',
                          )}
                        >
                          {formatBRL(product.adjustedPrice)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Voltar
              </Button>
              <Button size="lg" onClick={() => setStep(5)}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {/* ── PASSO 5 — FINALIZAÇÃO ─────────────────────────────────── */}
        {step === 5 && (
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
                  cliente. Configure as coordenadas em <strong>Minha Loja</strong> depois de criar a
                  conta — sem elas, a plataforma avisa que o frete é estimado e não inventa valores.
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
                  <Row label="Estabelecimento" value={name || '—'} />
                  <Row label="Endereço da loja" value={`/loja/${slugify(name) || '...'}`} />
                  <Row label="Produtos" value={`${selected.size} itens`} />
                  <Row
                    label="Faixa de preço"
                    value={
                      selected.size > 0
                        ? `${formatBRL(
                            Math.min(
                              ...pricedProducts
                                .filter((p) => selected.has(p.name))
                                .map((p) => p.adjustedPrice),
                            ),
                          )} – ${formatBRL(
                            Math.max(
                              ...pricedProducts
                                .filter((p) => selected.has(p.name))
                                .map((p) => p.adjustedPrice),
                            ),
                          )}`
                        : '—'
                    }
                  />
                  <Row label="Sua função" value="Proprietário" />
                </dl>

                <p className="mt-4 border-t border-ink-200 pt-3 text-[0.72rem] leading-relaxed text-ink-500">
                  Ao finalizar, criamos o estabelecimento, o catálogo e um caixa padrão. Você entra
                  no painel como proprietário.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <Button variant="ghost" onClick={() => setStep(4)} disabled={pending}>
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
