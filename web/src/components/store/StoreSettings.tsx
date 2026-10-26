'use client';
import {parseMoneyInput} from '@/lib/money-input';
import { announceStoreAvailability } from './StoreAvailabilitySync';
import { setStoreOpeningModeAction } from '@/app/actions/store-opening';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn, formatBRL } from '@/lib/utils';
import {
  lookupStoreCepAction,
  setStoreStatusAction,
  updateOrganizationAction,
} from '@/app/actions/organization';
import { BR_UFS } from '@/lib/br-ufs';
import { maxTierKm, sortTiers, tierForDistance, tierLabel, tierProblems } from '@/lib/delivery-tiers';
import {
  saveDeliveryAction,
  saveScheduleAction,
  createDeliveryZoneAction,
  updateDeliveryZoneAction,
  deleteDeliveryZoneAction,
} from '@/app/actions/store-ops';
import { BUSINESS_COPY, STORE_STATUS_LABEL } from '@/data/business-copy';
import { STORE_OPENING_MODE_LABEL, type StoreOpeningMode, summarizeSchedule, type WeekdaySchedule } from '@/lib/schedule';
import { ScheduleEditor } from './ScheduleEditor';
import { DeliveryAreaMap } from './DeliveryAreaMap';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  MoneyInput,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui';
import type { StoreStatus } from '@prisma/client';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MINHA LOJA
 * -----------------------------------------------------------------------
 * Identidade, endereço, entrega e o endereço público da loja.
 *
 * Só a PRÓPRIA loja: o organizationId vem da sessão no servidor, nunca
 * deste formulário. Não existe campo de organização aqui — se existisse,
 * seria uma porta para editar a loja de outro.
 *
 * A logo é URL, não arquivo. O storage ainda não está plugado, e base64
 * no banco está descartado de propósito — a tela diz isso à vontade em
 * vez de aceitar o arquivo e guardar um binário gigante.
 * ═══════════════════════════════════════════════════════════════════════
 */

export type StoreFormData = {
  name: string;
  slug: string;
  businessType: string;
  brandColor: string;
  logoUrl: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  /**
   * Coordenadas do estabelecimento. São ELAS a fonte da verdade para o
   * cálculo de distância e para o desenho da área de entrega — o endereço
   * em texto é o que a pessoa lê, não o que o servidor mede.
   *
   * Nulo é um estado legítimo: sem coordenada, o cálculo degrada para a
   * taxa base em vez de estimar um ponto (ver delivery-fee.ts).
   */
  latitude: number | null;
  longitude: number | null;
  openingHours: string | null;
  minimumOrder: number;
  deliveryRadius: number;
  baseDeliveryFee: number;
  extraKmFee: number;
  averageDeliveryTime: number;
  storeStatus: string;
  openingMode: StoreOpeningMode;
  /**
   * Agenda estruturada (settings.openingHours) e faixas de frete
   * (settings.deliveryTiers). Chegam separadas de `openingHours` porque
   * são coisas diferentes: o texto é o que a vitrine mostra, a agenda é o
   * que permite saber se a loja está aberta agora.
   */
  schedule: WeekdaySchedule[];
  deliveryTiers: Array<{ upToKm: number; fee: number }>;
  deliveryFeeMode: 'FIXED' | 'BY_NEIGHBORHOOD' | 'BY_DISTANCE_BAND';
  deliveryZones: Array<{
    id: string;
    name: string;
    fee: number;
    active: boolean;
    distanceKm: number | null;
    latitude: number | null;
    longitude: number | null;
    position: number;
  }>;
  allowPickup: boolean;
  allowOwnDelivery: boolean;
  allowMarketplace: boolean;
};

const STORE_STATUSES: Array<{ value: StoreOpeningMode; label: string; hint: string; tone: string }> = [
  {
    value: 'MANUAL_OPEN',
    label: 'Aberta manualmente',
    hint: 'Recebe pedidos mesmo fora dos horários configurados.',
    tone: 'border-success/40 bg-success-bg text-success',
  },
  {
    value: 'AUTO',
    label: 'Automático',
    hint: 'Segue os horários configurados e o fuso da loja.',
    tone: 'border-warn/40 bg-warn-bg text-warn',
  },
  {
    value: 'MANUAL_CLOSED',
    label: 'Fechada manualmente',
    hint: 'Impede novos pedidos até você reabrir.',
    tone: 'border-danger/40 bg-danger-bg text-danger',
  },
];

function money(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

export function StoreSettings({
  store,
  publicUrl,
  canManage,
  canChangeStatus,
  initialTab = 'identity',
}: {
  initialTab?: 'identity' | 'address' | 'hours' | 'delivery';
  store: StoreFormData;
  publicUrl: string;
  canManage: boolean;
  /**
   * Abrir/fechar é decisão operacional, não de configuração: quem cuida
   * do balcão precisa poder pausar a loja sem ganhar acesso ao resto
   * desta tela. Por isso a permissão é separada (MANAGE_ORDERS).
   */
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [tab, setTab] = useState<'identity' | 'address' | 'hours' | 'delivery'>(initialTab);
  const [form, setForm] = useState<StoreFormData>(store);
  const [status, setStatus] = useState<StoreOpeningMode>(store.openingMode);
  useEffect(() => setStatus(store.openingMode), [store.openingMode]);
  const [copied, setCopied] = useState(false);

  /**
   * Copiar o link é o que o lojista realmente faz com este endereço:
   * manda no grupo do bairro, põe na bio, manda no WhatsApp. Sem HTTPS
   * (rodando local) a API de clipboard não existe — nesse caso o texto é
   * selecionado, que é o comportamento honesto em vez de um "copiado" que
   * não copiou nada.
   */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copie o endereço da sua loja:', publicUrl);
    }
  }

  const [cepBusy, setCepBusy] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const invalidAddress = Boolean((form.city && !/\p{L}/u.test(form.city)) || (form.state && !BR_UFS.includes(form.state.toUpperCase() as (typeof BR_UFS)[number])));
  function set<K extends keyof StoreFormData>(key: K, value: StoreFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    setError(null);
    setFieldError(null);
    setSaved(false);

    const data = new FormData();
    data.set('name', form.name);
    data.set('businessType', 'BEVERAGE');
    data.set('brandColor', form.brandColor);
    data.set('logoUrl', form.logoUrl ?? '');
    data.set('description', form.description ?? '');
    data.set('phone', form.phone ?? '');
    data.set('whatsapp', form.whatsapp ?? '');
    data.set('email', form.email ?? '');
    data.set('address', form.address ?? '');
    data.set('addressNumber', form.addressNumber ?? '');
    data.set('addressComplement', form.addressComplement ?? '');
    data.set('district', form.district ?? '');
    data.set('city', form.city ?? '');
    data.set('state', form.state ?? '');
    data.set('zipCode', form.zipCode ?? '');
    data.set('openingHours', form.openingHours ?? '');
    data.set('minimumOrder', money(form.minimumOrder));
    data.set('deliveryRadius', String(form.deliveryRadius));
    data.set('baseDeliveryFee', money(form.baseDeliveryFee));
    data.set('extraKmFee', money(form.extraKmFee));
    data.set('averageDeliveryTime', String(form.averageDeliveryTime));

    startTransition(async () => {
      const result = await updateOrganizationAction(data);
      if (!result.ok) {
        setError(result.error);
        setFieldError(result.field ?? null);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  /**
   * Agenda e entrega salvam por conta própria.
   *
   * POR QUE NÃO VÃO JUNTO NO "SALVAR ALTERAÇÕES": a agenda é uma lista
   * aninhada (7 dias × até 4 períodos) e a entrega tem as faixas. Mandar
   * as duas junto com o resto faria qualquer erro de horário bloquear a
   * troca do nome da loja — campos sem relação nenhuma entre si. Aqui
   * cada bloco tem seu botão e seu recado.
   */
  function saveSchedule() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveScheduleAction({ schedule: form.schedule });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function saveDelivery() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveDeliveryAction({
        allowPickup: form.allowPickup,
        allowOwnDelivery: form.allowOwnDelivery,
        allowMarketplace: form.allowMarketplace,
        minimumOrder: form.minimumOrder,
        baseDeliveryFee: form.baseDeliveryFee,
        extraKmFee: form.extraKmFee,
        deliveryRadius: form.deliveryRadius,
        averageDeliveryTime: form.averageDeliveryTime,
        deliveryTiers: form.deliveryTiers,
        deliveryFeeMode: form.deliveryFeeMode,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function upsertZone(input: {
    name: string;
    fee: number;
    active: boolean;
    distanceKm?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }, zoneId?: string) {
    setError(null);
    startTransition(async () => {
      const result = zoneId
        ? await updateDeliveryZoneAction(zoneId, input)
        : await createDeliveryZoneAction(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function removeZone(zoneId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteDeliveryZoneAction(zoneId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function changeStatus(next: StoreOpeningMode) {
    setError(null);
    startTransition(async () => {
      const result = await setStoreOpeningModeAction(next);
      if (!result.ok) {setError(result.error);return;}
      setStatus(next);
      announceStoreAvailability(result.slug);
      router.refresh();
    });
  }

  const copy = BUSINESS_COPY.BEVERAGE;

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="Não foi possível salvar">
          {error}
        </Alert>
      )}
      {saved && !error && (
        <Alert tone="success" title="Alterações salvas">
          A vitrine pública já reflete o que foi alterado.
        </Alert>
      )}

      {/* ── Status da loja ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Status da loja"
          subtitle="Controla se a vitrine aceita pedidos agora."
          action={<Badge tone="neutral">{STORE_OPENING_MODE_LABEL[status]}</Badge>}
        />

        <div className="grid gap-2.5 sm:grid-cols-3">
          {STORE_STATUSES.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={!canChangeStatus || pending}
              onClick={() => changeStatus(option.value)}
              aria-pressed={status === option.value}
              className={cn(
                'rounded-lg border-2 px-4 py-3 text-left transition-all',
                status === option.value
                  ? option.tone
                  : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
                (!canChangeStatus || pending) && 'cursor-not-allowed opacity-70',
              )}
            >
              <span className="block text-[0.86rem] font-bold">{option.label}</span>
              <span className="mt-0.5 block text-[0.72rem] opacity-80">{option.hint}</span>
            </button>
          ))}
        </div>

        {!canChangeStatus && (
          <p className="mt-3 text-[0.74rem] text-ink-400">
            Seu perfil não pode alterar o status da loja.
          </p>
        )}
      </Card>

      {/* ── Endereço público ───────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Sua loja na internet"
          subtitle="Este é o endereço que o cliente acessa para pedir."
        />
        <div className="flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 truncate rounded border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[0.82rem] text-ink-700">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-sm border-2 border-ink-200 bg-white px-4 py-2.5 text-[0.82rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
          >
            {copied ? 'Link copiado' : 'Copiar link'}
          </button>
          <Link
            href={`/loja/${form.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border-2 border-ink-200 bg-white px-4 py-2.5 text-[0.82rem] font-semibold text-ink-700 transition-all hover:border-brand hover:text-brand"
          >
            Ver minha loja
          </Link>
        </div>
        <p className="mt-2.5 text-[0.74rem] text-ink-500">
          O endereço é derivado do nome e muda junto com ele. Se o novo endereço já estiver em uso
          por outra loja, o sistema adiciona um número no final em vez de recusar a alteração.
        </p>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'identity', label: 'Identidade' },
          { value: 'address', label: 'Endereço' },
          { value: 'hours', label: 'Horários' },
          { value: 'delivery', label: 'Entrega' },
        ]}
      />

      <Card>
        {tab === 'identity' && (
          <>
            <CardHeader
              title="Identidade"
              subtitle="Como a sua loja aparece no painel e na vitrine."
            />

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field
                label="Nome do estabelecimento"
                required
                error={fieldError === 'name' ? error ?? undefined : undefined}
              >
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  maxLength={120}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Tipo de negócio" hint="A plataforma é especializada em lojas de bebidas.">
                <Input value="Loja de bebidas" readOnly aria-readonly disabled />
              </Field>

              <Field
                label="Cor da marca"
                hint="Usada no painel, nos botões e no topo da vitrine."
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="color"
                    value={form.brandColor}
                    onChange={(e) => set('brandColor', e.target.value)}
                    disabled={!canManage}
                    aria-label="Cor da marca"
                    className="h-10 w-14 cursor-pointer rounded border border-ink-200 bg-white p-1"
                  />
                  <Input
                    value={form.brandColor}
                    onChange={(e) => set('brandColor', e.target.value)}
                    maxLength={7}
                    disabled={!canManage}
                    className="max-w-[120px] uppercase"
                  />
                </div>
              </Field>

              <Field
                label="Logo"
                hint="URL pública da imagem. O upload direto entra quando o storage estiver configurado."
                error={fieldError === 'logoUrl' ? error ?? undefined : undefined}
              >
                <Input
                  value={form.logoUrl ?? ''}
                  onChange={(e) => set('logoUrl', e.target.value || null)}
                  placeholder="https://…"
                  disabled={!canManage}
                />
              </Field>
            </div>

            <Field
              label="Descrição"
              hint="Aparece no topo da vitrine. Sem descrição, usamos a frase do seu segmento."
            >
              <Textarea
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value || null)}
                rows={3}
                maxLength={400}
                disabled={!canManage}
              />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <Field label="Telefone">
                <Input
                  value={form.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value || null)}
                  inputMode="tel"
                  disabled={!canManage}
                />
              </Field>
              <Field label="WhatsApp" hint="Usado no botão de contato da vitrine.">
                <Input
                  value={form.whatsapp ?? ''}
                  onChange={(e) => set('whatsapp', e.target.value || null)}
                  inputMode="tel"
                  disabled={!canManage}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', e.target.value || null)}
                  disabled={!canManage}
                />
              </Field>
            </div>

            {copy && (
              <Alert tone="neutral">
                Como <strong>{copy.noun}</strong>, a vitrine abre com a frase “{copy.description}”.
                A sua descrição acima tem prioridade.
              </Alert>
            )}
          </>
        )}

        {tab === 'address' && (
          <>
            <CardHeader
              title="Endereço e horário"
              subtitle="Aparece na vitrine e no comprovante dos pedidos."
            />

            <div className="grid gap-x-4 sm:grid-cols-[2fr_1fr]">
              <Field label="Rua / Avenida">
                <Input
                  value={form.address ?? ''}
                  onChange={(e) => set('address', e.target.value || null)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Número">
                <Input
                  value={form.addressNumber ?? ''}
                  onChange={(e) => set('addressNumber', e.target.value || null)}
                  disabled={!canManage}
                />
              </Field>
            </div>

            <Field label="Complemento">
              <Input
                value={form.addressComplement ?? ''}
                onChange={(e) => set('addressComplement', e.target.value || null)}
                disabled={!canManage}
              />
            </Field>

            <div className="grid gap-x-4 sm:grid-cols-3">
              <Field label="Bairro">
                <Input
                  value={form.district ?? ''}
                  onChange={(e) => set('district', e.target.value || null)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Cidade">
                <Input
                  value={form.city ?? ''}
                  onChange={(e) => set('city', e.target.value || null)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="UF">
                <Select
                  value={form.state ?? ''}
                  onChange={(e) => set('state', e.target.value || null)}
                  disabled={!canManage}
                  aria-label="UF"
                >
                  <option value="">Selecione</option>
                  {BR_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </Select>
              </Field>
            </div>

            <Field label="CEP" hint="Buscar CEP preenche rua, bairro, cidade e UF oficiais.">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={form.zipCode ?? ''}
                  onChange={(e) => set('zipCode', e.target.value || null)}
                  inputMode="numeric"
                  maxLength={9}
                  disabled={!canManage}
                  className="max-w-[180px]"
                  aria-label="CEP"
                />
                {canManage && (
                  <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={cepBusy || (form.zipCode ?? '').replace(/\D/g, '').length !== 8} onClick={async () => {
                    setCepBusy(true); setCepMessage(null);
                    const result = await lookupStoreCepAction({ cep: form.zipCode ?? '' }).catch(() => ({ ok: false as const, error: 'A consulta de CEP não respondeu agora.' }));
                    setCepBusy(false);
                    if (!result.ok) { setCepMessage(result.error); return; }
                    if (result.data.street) set('address', result.data.street);
                    if (result.data.district) set('district', result.data.district);
                    set('city', result.data.city); set('state', result.data.state);
                    setCepMessage('Endereço preenchido pelo CEP. Confira o número e salve.');
                  }}>Buscar CEP</Button>
                )}
              </div>
              {cepMessage && <p role="status" className="mt-1 text-[0.76rem] text-ink-600">{cepMessage}</p>}
            </Field>
            {invalidAddress && (
              <Alert tone="warn">Cidade ou UF parecem inválidas ({form.city ?? '—'} / {form.state ?? '—'}). Use o nome da cidade e a sigla do estado (ex.: Recife / PE) — ou Buscar CEP — e salve. Sem isso a localização pelo endereço não funciona.</Alert>
            )}

            <Alert tone="neutral">
              O status <strong>Aberta / Pausada / Fechada</strong> não é automático pelo horário —
              quem decide é você, na primeira seção desta página. Assim uma sexta cheia não derruba
              a vitrine por causa de um horário mal cadastrado.
            </Alert>
          </>
        )}

        {tab === 'hours' && (
          <>
            <CardHeader
              title="Horários de funcionamento"
              subtitle="Um dia pode ter mais de um período — almoço e jantar, por exemplo."
            />

            <ScheduleEditor
              value={form.schedule}
              onChange={(next) => set('schedule', next)}
              disabled={!canManage}
            />

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <p className="text-[0.74rem] text-ink-400">
                Salvo aqui, o resumo vai sozinho para o texto que a vitrine mostra.
              </p>
              <Button loading={pending} onClick={saveSchedule} disabled={!canManage}>
                Salvar horários
              </Button>
            </div>
          </>
        )}

        {tab === 'delivery' && (
          <>
            <CardHeader
              title="Entrega"
              subtitle="Regras que valem na vitrine e no cálculo do frete."
            />

            {/* ── Modalidades de atendimento (4.22) ─────────────────── */}
            <div className="mb-4 space-y-2">
              <Modality
                checked={form.allowPickup}
                onChange={(v) => set('allowPickup', v)}
                disabled={!canManage}
                label="Retirada no balcão"
                hint="O cliente busca no endereço da loja. Nesse caso o frete é zero."
              />
              <Modality
                checked={form.allowOwnDelivery}
                onChange={(v) => set('allowOwnDelivery', v)}
                disabled={!canManage}
                label="Entrega própria"
                hint="Você entrega com a sua equipe. O frete segue as regras abaixo."
              />
              <p className="rounded-lg border border-ink-100 px-4 py-3 text-sm text-ink-500">
                Canais parceiros são administrados pela plataforma. A disponibilidade será informada após a conexão do serviço.
              </p>
            </div>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Pedido mínimo" hint="Zero libera qualquer valor.">
                <MoneyInput
                  value={money(form.minimumOrder)}
                  onChange={(e) => set('minimumOrder', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Taxa base de entrega" hint="Valor cobrado antes do cálculo por km.">
                <MoneyInput
                  value={money(form.baseDeliveryFee)}
                  onChange={(e) => set('baseDeliveryFee', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Valor por km excedente" hint="Somado à taxa base além do raio incluso.">
                <MoneyInput
                  value={money(form.extraKmFee)}
                  onChange={(e) => set('extraKmFee', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Raio de entrega (km)" hint="Fora do raio, o endereço é recusado.">
                <Input
                  value={String(form.deliveryRadius)}
                  onChange={(e) => set('deliveryRadius', Number(e.target.value) || 0)}
                  inputMode="decimal"
                  disabled={!canManage}
                />
              </Field>

              <Field
                label="Tempo médio de entrega (min)"
                hint="Aparece no topo da vitrine. É estimativa, não promessa."
              >
                <Input
                  value={String(form.averageDeliveryTime)}
                  onChange={(e) => set('averageDeliveryTime', Number(e.target.value) || 0)}
                  inputMode="numeric"
                  disabled={!canManage}
                />
              </Field>
            </div>

            {/* ── Modo de taxa (Fase 3) ─────────────────────────────── */}
            <Field
              label="Como o frete é calculado"
              hint="Uma única regra vale na vitrine, no checkout e no mapa da expedição."
            >
              <Select
                value={form.deliveryFeeMode}
                onChange={(e) =>
                  set(
                    'deliveryFeeMode',
                    e.target.value as StoreFormData['deliveryFeeMode'],
                  )
                }
                disabled={!canManage}
              >
                <option value="FIXED">Taxa fixa + valor por km excedente</option>
                <option value="BY_NEIGHBORHOOD">Taxa por bairro</option>
                <option value="BY_DISTANCE_BAND">Taxa por faixa de distância</option>
              </Select>
            </Field>

            {/* ── Bairros e taxas (Fase 3) ──────────────────────────── */}
            {form.deliveryFeeMode === 'BY_NEIGHBORHOOD' && (
              <DeliveryZones
                zones={form.deliveryZones}
                disabled={!canManage}
                onCreate={(input) => upsertZone(input)}
                onUpdate={(id, input) => upsertZone(input, id)}
                onDelete={removeZone}
              />
            )}

            {/* ── Faixas por distância (4.22 / Fase 3) ──────────────── */}
            {form.deliveryFeeMode === 'BY_DISTANCE_BAND' && (
              <DeliveryTiers
                tiers={form.deliveryTiers}
                onChange={(next) => set('deliveryTiers', next)}
                disabled={!canManage}
              />
            )}

            {/* ── Localização e área de entrega (Fase 3) ─────────────── */}
            <DeliveryAreaMap
              latitude={form.latitude}
              longitude={form.longitude}
              radiusKm={form.deliveryRadius}
              zones={form.deliveryZones}
              canManage={canManage}
              addressReady={Boolean(form.address && form.city && form.state)}
              onAddressFromPoint={(fields) => {
                if (fields.street) set('address', fields.street);
                if (fields.number) set('addressNumber', fields.number);
                if (fields.district) set('district', fields.district);
                if (fields.city) set('city', fields.city);
                if (fields.state) set('state', fields.state);
                if (fields.zipCode) set('zipCode', fields.zipCode);
              }}
            />

            <Alert tone="info">
              {form.deliveryFeeMode === 'FIXED' && (
                <>
                  Você entrega em até <strong>{form.deliveryRadius} km</strong>. A taxa é{' '}
                  <strong>{formatBRL(form.baseDeliveryFee)}</strong> dentro do raio, somando{' '}
                  <strong>{formatBRL(form.extraKmFee)}</strong> por km excedente. O cálculo pela
                  distância real acontece quando a loja e o endereço têm coordenadas — sem
                  coordenada, vale a taxa base.
                </>
              )}
              {form.deliveryFeeMode === 'BY_NEIGHBORHOOD' && (
                <>
                  O frete sai da taxa de cada bairro. O endereço que não estiver em nenhum bairro
                  ativo é recusado no checkout. Distância e coordenada do bairro são informativas
                  (mapa) — não mudam o preço.
                </>
              )}
              {form.deliveryFeeMode === 'BY_DISTANCE_BAND' && (
                <>
                  O frete sai da faixa que alcança a distância do endereço. Sem faixas cadastradas,
                  vale a taxa base.
                </>
              )}
            </Alert>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <p className="text-[0.74rem] text-ink-400">
                {summarizeSchedule(form.schedule)
                  ? 'O horário de funcionamento fica na aba Horários.'
                  : 'Você ainda não definiu horários.'}
              </p>
              <Button loading={pending} onClick={saveDelivery} disabled={!canManage}>
                Salvar entrega
              </Button>
            </div>
          </>
        )}

        {/* Identidade e endereço continuam no botão único: são campos
            soltos, e salvar junto não cria dependência entre eles. */}
        {canManage && (tab === 'identity' || tab === 'address') && (
          <div className="mt-5 flex justify-end gap-2.5 border-t border-ink-100 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setForm(store);
                setSaved(false);
                setError(null);
              }}
              disabled={pending}
            >
              Descartar
            </Button>
            <Button loading={pending} onClick={save}>
              Salvar alterações
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Interruptor de modalidade de atendimento. */
function Modality({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border-2 px-3.5 py-3 transition-all',
        checked ? 'border-brand bg-brand-light/40' : 'border-ink-200 bg-white',
        disabled && 'cursor-not-allowed opacity-70',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--orange)]"
      />
      <span>
        <span className="block text-[0.84rem] font-semibold text-ink-800">{label}</span>
        <span className="mt-0.5 block text-[0.74rem] leading-relaxed text-ink-500">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Faixas de frete por distância.
 *
 * Edição por lista, sem drag-and-drop: subir/descer e remover. A ordenação
 * final é feita no servidor (por km crescente), porque uma faixa fora de
 * ordem daria um frete errado — e o cliente não deve poder causar isso.
 */
function DeliveryTiers({
  tiers,
  onChange,
  disabled,
}: {
  tiers: Array<{ upToKm: number; fee: number }>;
  onChange: (next: Array<{ upToKm: number; fee: number }>) => void;
  disabled?: boolean;
}) {
  const [previewKm, setPreviewKm] = useState('3');
  const problems = tierProblems(tiers);
  const sorted = sortTiers(tiers);
  const max = maxTierKm(tiers);
  const km = Number(previewKm.replace(',', '.'));
  const preview = Number.isFinite(km) && km >= 0 && tiers.length ? tierForDistance(tiers, km) : null;
  const update = (index: number, patch: Partial<{ upToKm: number; fee: number }>) => onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  return (
    <div className="mt-2 rounded-xl border border-ink-200 p-3.5" data-testid="delivery-tiers">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.88rem] font-semibold text-ink-900">Taxas por faixa de distância</p>
          <p className="text-[0.76rem] text-ink-500">Cada faixa vale de onde a anterior termina até o limite informado. A última faixa é a distância máxima atendida.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" className="min-h-10" disabled={disabled || tiers.length >= 10} onClick={() => onChange(sortTiers([...tiers, { upToKm: tierSuggestion(sorted), fee: sorted.length ? sorted[sorted.length - 1].fee : 0 }]))}>
          + Adicionar faixa
        </Button>
      </div>

      {tiers.length === 0 ? (
        <p className="rounded-lg bg-ink-50 px-3 py-3 text-[0.8rem] text-ink-500">Nenhuma faixa ainda. Até cadastrar, vale a taxa base.</p>
      ) : (
        <ul className="space-y-2">
          {tiers.map((tier, index) => {
            const position = sorted.indexOf(tier);
            return (
              <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg bg-ink-50/60 p-2.5 sm:grid-cols-[minmax(0,1.3fr)_8rem_9rem_auto]" data-testid="tier-row">
                <p className="col-span-3 text-[0.78rem] font-semibold text-ink-700 sm:col-span-1 sm:self-center">{position >= 0 && tier.upToKm > 0 ? tierLabel(tiers, position) : 'Faixa incompleta'}</p>
                <div>
                  <label className="field-label" htmlFor={`tier-km-${index}`}>Até (km)</label>
                  <Input id={`tier-km-${index}`} value={String(tier.upToKm || '')} onChange={(e) => update(index, { upToKm: Number(e.target.value.replace(',', '.')) || 0 })} onBlur={() => onChange(sortTiers(tiers))} inputMode="decimal" disabled={disabled} className="!py-1.5 text-[0.86rem]" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`tier-fee-${index}`}>Taxa</label>
                  <MoneyInput id={`tier-fee-${index}`} value={money(tier.fee)} onChange={(e) => update(index, { fee: parseMoney(e.target.value) })} disabled={disabled} className="!py-1.5 text-[0.86rem]" />
                </div>
                <button type="button" disabled={disabled} onClick={() => onChange(tiers.filter((_, i) => i !== index))} className="min-h-10 rounded-lg px-2.5 text-[0.76rem] font-semibold text-ink-500 hover:bg-white hover:text-danger disabled:opacity-50" aria-label={`Remover faixa de ${tier.upToKm} km`}>
                  Remover
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {problems.length > 0 && <div className="mt-2.5"><Alert tone="danger">{problems.join(' ')}</Alert></div>}
      {max !== null && problems.length === 0 && <p className="mt-2.5 text-[0.78rem] text-ink-600">Distância máxima atendida: <strong>{max.toLocaleString('pt-BR')} km</strong>. Endereços além disso são recusados no checkout.</p>}

      {tiers.length > 0 && problems.length === 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-ink-200 p-3" data-testid="tier-preview">
          <div className="w-32">
            <label className="field-label" htmlFor="tier-preview-km">Testar distância (km)</label>
            <Input id="tier-preview-km" value={previewKm} onChange={(e) => setPreviewKm(e.target.value)} inputMode="decimal" className="!py-1.5 text-[0.86rem]" />
          </div>
          <p className="min-w-0 flex-1 text-[0.82rem] text-ink-700" aria-live="polite">
            {!preview ? 'Informe uma distância.' : preview.outside ? <><strong className="text-danger">Fora da área</strong> — acima de {max?.toLocaleString('pt-BR')} km.</> : <>Taxa: <strong>{formatBRL(preview.tier!.fee)}</strong> ({tierLabel(tiers, sorted.indexOf(preview.tier!)).toLowerCase()}).</>}
          </p>
          <p className="w-full text-[0.72rem] text-ink-500">No pedido, a distância é medida pelas ruas quando o serviço de rotas está ativo; sem ele, em linha reta a partir do ponto da loja.</p>
        </div>
      )}
    </div>
  );
}

/** Próximo limite sugerido, para não repetir a mesma faixa. */
function tierSuggestion(tiers: Array<{ upToKm: number }>): number {
  const last = tiers[tiers.length - 1];
  return last ? Math.round((last.upToKm + 2) * 10) / 10 : 3;
}

function parseMoney(value: string): number {return parseMoneyInput(value)??Number.NaN;}

/**
 * Bairros com taxa de entrega.
 *
 * A lista é editada linha a linha, sem arrastar. Distância e coordenada
 * são opcionais e informativas (desenho do mapa), nunca a fonte do preço:
 * o preço é a taxa digitada. O nome do bairro é o que o cliente informa no
 * checkout — por isso não pode haver dois bairros com o mesmo nome.
 */
type ZoneRow = {
  id?: string;
  name: string;
  fee: number;
  active: boolean;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

function DeliveryZones({
  zones,
  disabled,
  onCreate,
  onUpdate,
  onDelete,
}: {
  zones: StoreFormData['deliveryZones'];
  disabled?: boolean;
  onCreate: (input: ZoneRow) => void;
  onUpdate: (id: string, input: ZoneRow) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<ZoneRow>({ name: '', fee: 0, active: true });
  const [editing, setEditing] = useState<string | null>(null);

  function resetDraft() {
    setDraft({ name: '', fee: 0, active: true });
    setEditing(null);
  }

  function submit() {
    const name = draft.name.trim();
    if (name.length < 2) return;
    if (editing) {
      onUpdate(editing, draft);
    } else {
      onCreate(draft);
    }
    resetDraft();
  }

  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3.5">
      <div className="mb-2.5">
        <p className="text-[0.84rem] font-semibold text-ink-800">Bairros atendidos</p>
        <p className="text-[0.74rem] text-ink-500">
          Cada bairro tem a própria taxa. O cliente só é atendido se o bairro dele estiver aqui e
          ativo.
        </p>
      </div>

      <ul className="space-y-2">
        {zones.length === 0 && (
          <li className="py-1 text-[0.78rem] text-ink-400">
            Nenhum bairro cadastrado. O checkout recusa entregas até você cadastrar ao menos um.
          </li>
        )}
        {zones.map((zone) =>
          editing === zone.id ? (
            <li key={zone.id} className="rounded-md border border-brand/30 bg-brand-light/20 p-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label className="field-label" htmlFor="zone-edit-name">Nome do bairro</label>
                  <Input
                    id="zone-edit-name"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    disabled={disabled}
                    className="!py-1.5 text-[0.84rem]"
                  />
                </div>
                <div className="w-[140px]">
                  <label className="field-label" htmlFor="zone-edit-fee">Taxa</label>
                  <MoneyInput
                    id="zone-edit-fee"
                    value={money(draft.fee)}
                    onChange={(e) => setDraft((d) => ({ ...d, fee: parseMoney(e.target.value) }))}
                    disabled={disabled}
                    className="!py-1.5 text-[0.84rem]"
                  />
                </div>
                <div className="w-[150px]">
                  <label className="field-label" htmlFor="zone-edit-dist">Distância (km)</label>
                  <Input
                    id="zone-edit-dist"
                    value={draft.distanceKm == null ? '' : String(draft.distanceKm)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        distanceKm: e.target.value === '' ? null : Number(e.target.value) || null,
                      }))
                    }
                    inputMode="decimal"
                    disabled={disabled}
                    className="!py-1.5 text-[0.84rem]"
                  />
                </div>
                {/* Ativar/desativar sem apagar o bairro: desativar é temporário
                    (não entrego ali hoje), remover é definitivo. Sem esta
                    chave, o lojista que pausa um bairro apagava a taxa e
                    perdia o cadastro. */}
                <label className="flex items-center gap-1.5 pb-2 text-[0.78rem] font-medium text-ink-600">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                    disabled={disabled}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  Ativo
                </label>
                <div className="flex gap-1.5 pb-0.5">
                  <Button type="button" size="sm" onClick={submit} disabled={disabled}>
                    Salvar
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={resetDraft} disabled={disabled}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </li>
          ) : (
            <li
              key={zone.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-ink-100 bg-white px-2.5 py-2"
            >
              <span className="min-w-[160px] flex-1 truncate text-[0.84rem] font-medium text-ink-800">
                {zone.name}
              </span>
              <span className="text-[0.82rem] font-semibold text-ink-700">
                {formatBRL(zone.fee)}
              </span>
              {zone.distanceKm != null && (
                <span className="text-[0.72rem] text-ink-400">{zone.distanceKm} km</span>
              )}
              <Badge tone={zone.active ? 'green' : 'neutral'}>
                {zone.active ? 'Ativo' : 'Inativo'}
              </Badge>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setEditing(zone.id);
                  setDraft({
                    id: zone.id,
                    name: zone.name,
                    fee: zone.fee,
                    active: zone.active,
                    distanceKm: zone.distanceKm,
                    latitude: zone.latitude,
                    longitude: zone.longitude,
                  });
                }}
                className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-600 transition-all hover:bg-ink-100 disabled:opacity-50"
              >
                Editar
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(zone.id)}
                className="rounded-sm px-2.5 py-1.5 text-[0.74rem] font-semibold text-ink-400 transition-all hover:bg-ink-100 hover:text-danger disabled:opacity-50"
              >
                Remover
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === null && (
        <div className="mt-3 rounded-md border border-ink-100 bg-ink-50/50 p-2.5">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <label className="field-label" htmlFor="zone-new-name">Nome do bairro</label>
              <Input
                id="zone-new-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                disabled={disabled}
                placeholder="Centro"
                className="!py-1.5 text-[0.84rem]"
              />
            </div>
            <div className="w-[140px]">
              <label className="field-label" htmlFor="zone-new-fee">Taxa</label>
              <MoneyInput
                id="zone-new-fee"
                value={money(draft.fee)}
                onChange={(e) => setDraft((d) => ({ ...d, fee: parseMoney(e.target.value) }))}
                disabled={disabled}
                className="!py-1.5 text-[0.84rem]"
              />
            </div>
            <div className="w-[150px]">
              <label className="field-label" htmlFor="zone-new-dist">Distância (km)</label>
              <Input
                id="zone-new-dist"
                value={draft.distanceKm == null ? '' : String(draft.distanceKm)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    distanceKm: e.target.value === '' ? null : Number(e.target.value) || null,
                  }))
                }
                inputMode="decimal"
                disabled={disabled}
                placeholder="opcional"
                className="!py-1.5 text-[0.84rem]"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[0.78rem] font-medium text-ink-600">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
                disabled={disabled}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Ativo
            </label>
            <div className="flex gap-1.5 pb-0.5">
              <Button type="button" size="sm" onClick={submit} disabled={disabled || draft.name.trim().length < 2}>
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

