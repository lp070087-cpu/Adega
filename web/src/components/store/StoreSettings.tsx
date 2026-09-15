'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn, formatBRL } from '@/lib/utils';
import {
  setStoreStatusAction,
  updateOrganizationAction,
} from '@/app/actions/organization';
import {
  saveDeliveryAction,
  saveScheduleAction,
  createDeliveryZoneAction,
  updateDeliveryZoneAction,
  deleteDeliveryZoneAction,
} from '@/app/actions/store-ops';
import { BUSINESS_COPY, STORE_STATUS_LABEL } from '@/data/business-copy';
import { summarizeSchedule, type WeekdaySchedule } from '@/lib/schedule';
import { ScheduleEditor } from './ScheduleEditor';
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
import type { BusinessType, StoreStatus } from '@prisma/client';

/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * MINHA LOJA
 * -----------------------------------------------------------------------
 * Identidade, endereÃ§o, entrega e o endereÃ§o pÃºblico da loja.
 *
 * SÃ³ a PRÃ“PRIA loja: o organizationId vem da sessÃ£o no servidor, nunca
 * deste formulÃ¡rio. NÃ£o existe campo de organizaÃ§Ã£o aqui â€” se existisse,
 * seria uma porta para editar a loja de outro.
 *
 * A logo Ã© URL, nÃ£o arquivo. O storage ainda nÃ£o estÃ¡ plugado, e base64
 * no banco estÃ¡ descartado de propÃ³sito â€” a tela diz isso Ã  vontade em
 * vez de aceitar o arquivo e guardar um binÃ¡rio gigante.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
  openingHours: string | null;
  minimumOrder: number;
  deliveryRadius: number;
  baseDeliveryFee: number;
  extraKmFee: number;
  averageDeliveryTime: number;
  storeStatus: string;
  /**
   * Agenda estruturada (settings.openingHours) e faixas de frete
   * (settings.deliveryTiers). Chegam separadas de `openingHours` porque
   * sÃ£o coisas diferentes: o texto Ã© o que a vitrine mostra, a agenda Ã© o
   * que permite saber se a loja estÃ¡ aberta agora.
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

const STORE_STATUSES: Array<{ value: StoreStatus; label: string; hint: string; tone: string }> = [
  {
    value: 'OPEN',
    label: 'Aberta',
    hint: 'A vitrine aceita pedidos agora.',
    tone: 'border-success/40 bg-success-bg text-success',
  },
  {
    value: 'PAUSED',
    label: 'Pausada',
    hint: 'A vitrine continua no ar, mas sem receber pedidos por um tempo.',
    tone: 'border-warn/40 bg-warn-bg text-warn',
  },
  {
    value: 'CLOSED',
    label: 'Fechada',
    hint: 'Fora do horÃ¡rio. A vitrine aparece como fechada.',
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
}: {
  store: StoreFormData;
  publicUrl: string;
  canManage: boolean;
  /**
   * Abrir/fechar Ã© decisÃ£o operacional, nÃ£o de configuraÃ§Ã£o: quem cuida
   * do balcÃ£o precisa poder pausar a loja sem ganhar acesso ao resto
   * desta tela. Por isso a permissÃ£o Ã© separada (MANAGE_ORDERS).
   */
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [tab, setTab] = useState<'identity' | 'address' | 'hours' | 'delivery'>('identity');
  const [form, setForm] = useState<StoreFormData>(store);
  const [status, setStatus] = useState(store.storeStatus);
  const [copied, setCopied] = useState(false);

  /**
   * Copiar o link Ã© o que o lojista realmente faz com este endereÃ§o:
   * manda no grupo do bairro, pÃµe na bio, manda no WhatsApp. Sem HTTPS
   * (rodando local) a API de clipboard nÃ£o existe â€” nesse caso o texto Ã©
   * selecionado, que Ã© o comportamento honesto em vez de um "copiado" que
   * nÃ£o copiou nada.
   */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copie o endereÃ§o da sua loja:', publicUrl);
    }
  }

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
    data.set('businessType', form.businessType);
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
   * Agenda e entrega salvam por conta prÃ³pria.
   *
   * POR QUE NÃƒO VÃƒO JUNTO NO "SALVAR ALTERAÃ‡Ã•ES": a agenda Ã© uma lista
   * aninhada (7 dias Ã— atÃ© 4 perÃ­odos) e a entrega tem as faixas. Mandar
   * as duas junto com o resto faria qualquer erro de horÃ¡rio bloquear a
   * troca do nome da loja â€” campos sem relaÃ§Ã£o nenhuma entre si. Aqui
   * cada bloco tem seu botÃ£o e seu recado.
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

  function changeStatus(next: StoreStatus) {
    setError(null);
    const previous = status;
    // Otimista: a troca de status Ã© reversÃ­vel e o servidor confirma
    // logo em seguida. Se falhar, o valor volta ao anterior.
    setStatus(next);

    startTransition(async () => {
      const result = await setStoreStatusAction(next);
      if (!result.ok) {
        setStatus(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const copy = BUSINESS_COPY[form.businessType as BusinessType];

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="NÃ£o foi possÃ­vel salvar">
          {error}
        </Alert>
      )}
      {saved && !error && (
        <Alert tone="success" title="AlteraÃ§Ãµes salvas">
          A vitrine pÃºblica jÃ¡ reflete o que foi alterado.
        </Alert>
      )}

      {/* â”€â”€ Status da loja â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card>
        <CardHeader
          title="Status da loja"
          subtitle="Controla se a vitrine aceita pedidos agora."
          action={<Badge tone="neutral">{STORE_STATUS_LABEL[status as StoreStatus] ?? status}</Badge>}
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
            Seu perfil nÃ£o pode alterar o status da loja.
          </p>
        )}
      </Card>

      {/* â”€â”€ EndereÃ§o pÃºblico â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Card>
        <CardHeader
          title="Sua loja na internet"
          subtitle="Este Ã© o endereÃ§o que o cliente acessa para pedir."
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
          O endereÃ§o Ã© derivado do nome e muda junto com ele. Se o novo endereÃ§o jÃ¡ estiver em uso
          por outra loja, o sistema adiciona um nÃºmero no final em vez de recusar a alteraÃ§Ã£o.
        </p>
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'identity', label: 'Identidade' },
          { value: 'address', label: 'EndereÃ§o' },
          { value: 'hours', label: 'HorÃ¡rios' },
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

              <Field label="Tipo de negÃ³cio" hint="Muda as sugestÃµes e os textos da vitrine.">
                <Select
                  value={form.businessType}
                  onChange={(e) => set('businessType', e.target.value)}
                  disabled={!canManage}
                >
                  {Object.entries(BUSINESS_COPY).map(([value, entry]) => (
                    <option key={value} value={value}>
                      {entry.noun.charAt(0).toUpperCase() + entry.noun.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Cor da marca"
                hint="Usada no painel, nos botÃµes e no topo da vitrine."
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
                hint="URL pÃºblica da imagem. O upload direto entra quando o storage estiver configurado."
                error={fieldError === 'logoUrl' ? error ?? undefined : undefined}
              >
                <Input
                  value={form.logoUrl ?? ''}
                  onChange={(e) => set('logoUrl', e.target.value || null)}
                  placeholder="https://â€¦"
                  disabled={!canManage}
                />
              </Field>
            </div>

            <Field
              label="DescriÃ§Ã£o"
              hint="Aparece no topo da vitrine. Sem descriÃ§Ã£o, usamos a frase do seu segmento."
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
              <Field label="WhatsApp" hint="Usado no botÃ£o de contato da vitrine.">
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
                Como <strong>{copy.noun}</strong>, a vitrine abre com a frase â€œ{copy.description}â€.
                A sua descriÃ§Ã£o acima tem prioridade.
              </Alert>
            )}
          </>
        )}

        {tab === 'address' && (
          <>
            <CardHeader
              title="EndereÃ§o e horÃ¡rio"
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
              <Field label="NÃºmero">
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
                <Input
                  value={form.state ?? ''}
                  onChange={(e) => set('state', e.target.value.toUpperCase() || null)}
                  maxLength={2}
                  className="uppercase"
                  disabled={!canManage}
                />
              </Field>
            </div>

            <Field label="CEP">
              <Input
                value={form.zipCode ?? ''}
                onChange={(e) => set('zipCode', e.target.value || null)}
                inputMode="numeric"
                maxLength={9}
                disabled={!canManage}
                className="max-w-[180px]"
              />
            </Field>

            <Alert tone="neutral">
              O status <strong>Aberta / Pausada / Fechada</strong> nÃ£o Ã© automÃ¡tico pelo horÃ¡rio â€”
              quem decide Ã© vocÃª, na primeira seÃ§Ã£o desta pÃ¡gina. Assim uma sexta cheia nÃ£o derruba
              a vitrine por causa de um horÃ¡rio mal cadastrado.
            </Alert>
          </>
        )}

        {tab === 'hours' && (
          <>
            <CardHeader
              title="HorÃ¡rios de funcionamento"
              subtitle="Um dia pode ter mais de um perÃ­odo â€” almoÃ§o e jantar, por exemplo."
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
                Salvar horÃ¡rios
              </Button>
            </div>
          </>
        )}

        {tab === 'delivery' && (
          <>
            <CardHeader
              title="Entrega"
              subtitle="Regras que valem na vitrine e no cÃ¡lculo do frete."
            />

            {/* â”€â”€ Modalidades de atendimento (4.22) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div className="mb-4 space-y-2">
              <Modality
                checked={form.allowPickup}
                onChange={(v) => set('allowPickup', v)}
                disabled={!canManage}
                label="Retirada no balcÃ£o"
                hint="O cliente busca no endereÃ§o da loja. Nesse caso o frete Ã© zero."
              />
              <Modality
                checked={form.allowOwnDelivery}
                onChange={(v) => set('allowOwnDelivery', v)}
                disabled={!canManage}
                label="Entrega prÃ³pria"
                hint="VocÃª entrega com a sua equipe. O frete segue as regras abaixo."
              />
              <Modality
                checked={form.allowMarketplace}
                onChange={(v) => set('allowMarketplace', v)}
                disabled={!canManage}
                label="Entrega por parceiro (marketplace)"
                hint="iFood, 99Food e ZÃ© Delivery ainda nÃ£o tÃªm integraÃ§Ã£o. Ligar aqui sÃ³ sinaliza a intenÃ§Ã£o â€” nenhum pedido entra por esses canais enquanto o adapter nÃ£o existir."
              />
            </div>

            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Pedido mÃ­nimo" hint="Zero libera qualquer valor.">
                <MoneyInput
                  value={money(form.minimumOrder)}
                  onChange={(e) => set('minimumOrder', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Taxa base de entrega" hint="Valor cobrado antes do cÃ¡lculo por km.">
                <MoneyInput
                  value={money(form.baseDeliveryFee)}
                  onChange={(e) => set('baseDeliveryFee', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Valor por km excedente" hint="Somado Ã  taxa base alÃ©m do raio incluso.">
                <MoneyInput
                  value={money(form.extraKmFee)}
                  onChange={(e) => set('extraKmFee', parseMoney(e.target.value))}
                  disabled={!canManage}
                />
              </Field>

              <Field label="Raio de entrega (km)" hint="Fora do raio, o endereÃ§o Ã© recusado.">
                <Input
                  value={String(form.deliveryRadius)}
                  onChange={(e) => set('deliveryRadius', Number(e.target.value) || 0)}
                  inputMode="decimal"
                  disabled={!canManage}
                />
              </Field>

              <Field
                label="Tempo mÃ©dio de entrega (min)"
                hint="Aparece no topo da vitrine. Ã‰ estimativa, nÃ£o promessa."
              >
                <Input
                  value={String(form.averageDeliveryTime)}
                  onChange={(e) => set('averageDeliveryTime', Number(e.target.value) || 0)}
                  inputMode="numeric"
                  disabled={!canManage}
                />
              </Field>
            </div>

            {/* â”€â”€ Modo de taxa (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Field
              label="Como o frete Ã© calculado"
              hint="Uma Ãºnica regra vale na vitrine, no checkout e no mapa da expediÃ§Ã£o."
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
                <option value="BY_DISTANCE_BAND">Taxa por faixa de distÃ¢ncia</option>
              </Select>
            </Field>

            {/* â”€â”€ Bairros e taxas (Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {form.deliveryFeeMode === 'BY_NEIGHBORHOOD' && (
              <DeliveryZones
                zones={form.deliveryZones}
                disabled={!canManage}
                onCreate={(input) => upsertZone(input)}
                onUpdate={(id, input) => upsertZone(input, id)}
                onDelete={removeZone}
              />
            )}

            {/* â”€â”€ Faixas por distÃ¢ncia (4.22 / Fase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {form.deliveryFeeMode === 'BY_DISTANCE_BAND' && (
              <DeliveryTiers
                tiers={form.deliveryTiers}
                onChange={(next) => set('deliveryTiers', next)}
                disabled={!canManage}
              />
            )}

            <Alert tone="info">
              {form.deliveryFeeMode === 'FIXED' && (
                <>
                  VocÃª entrega em atÃ© <strong>{form.deliveryRadius} km</strong>. A taxa Ã©{' '}
                  <strong>{formatBRL(form.baseDeliveryFee)}</strong> dentro do raio, somando{' '}
                  <strong>{formatBRL(form.extraKmFee)}</strong> por km excedente. O cÃ¡lculo pela
                  distÃ¢ncia real acontece quando a loja e o endereÃ§o tÃªm coordenadas â€” sem
                  coordenada, vale a taxa base.
                </>
              )}
              {form.deliveryFeeMode === 'BY_NEIGHBORHOOD' && (
                <>
                  O frete sai da taxa de cada bairro. O endereÃ§o que nÃ£o estiver em nenhum bairro
                  ativo Ã© recusado no checkout. DistÃ¢ncia e coordenada do bairro sÃ£o informativas
                  (mapa) â€” nÃ£o mudam o preÃ§o.
                </>
              )}
              {form.deliveryFeeMode === 'BY_DISTANCE_BAND' && (
                <>
                  O frete sai da faixa que alcanÃ§a a distÃ¢ncia do endereÃ§o. Sem faixas cadastradas,
                  vale a taxa base.
                </>
              )}
            </Alert>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <p className="text-[0.74rem] text-ink-400">
                {summarizeSchedule(form.schedule)
                  ? 'O horÃ¡rio de funcionamento fica na aba HorÃ¡rios.'
                  : 'VocÃª ainda nÃ£o definiu horÃ¡rios.'}
              </p>
              <Button loading={pending} onClick={saveDelivery} disabled={!canManage}>
                Salvar entrega
              </Button>
            </div>
          </>
        )}

        {/* Identidade e endereÃ§o continuam no botÃ£o Ãºnico: sÃ£o campos
            soltos, e salvar junto nÃ£o cria dependÃªncia entre eles. */}
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
              Salvar alteraÃ§Ãµes
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
 * Faixas de frete por distÃ¢ncia.
 *
 * EdiÃ§Ã£o por lista, sem drag-and-drop: subir/descer e remover. A ordenaÃ§Ã£o
 * final Ã© feita no servidor (por km crescente), porque uma faixa fora de
 * ordem daria um frete errado â€” e o cliente nÃ£o deve poder causar isso.
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
  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[0.84rem] font-semibold text-ink-800">Faixas por distÃ¢ncia</p>
          <p className="text-[0.74rem] text-ink-500">
            Opcional. Se vocÃª nÃ£o usar faixas, vale a taxa base acima.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || tiers.length >= 10}
          onClick={() => onChange([...tiers, { upToKm: tierSuggestion(tiers), fee: 0 }])}
        >
          + Adicionar faixa
        </Button>
      </div>

      {tiers.length === 0 ? (
        <p className="py-2 text-[0.78rem] text-ink-400">
          Nenhuma faixa. O frete Ã© a taxa base, sem variaÃ§Ã£o por distÃ¢ncia.
        </p>
      ) : (
        <ul className="space-y-2">
          {tiers.map((tier, index) => (
            <li key={index} className="flex flex-wrap items-end gap-2">
              <div className="w-[130px]">
                <label className="field-label" htmlFor={`tier-km-${index}`}>
                  AtÃ© (km)
                </label>
                <Input
                  id={`tier-km-${index}`}
                  value={String(tier.upToKm)}
                  onChange={(e) =>
                    onChange(
                      tiers.map((t, i) =>
                        i === index ? { ...t, upToKm: Number(e.target.value) || 0 } : t,
                      ),
                    )
                  }
                  inputMode="decimal"
                  disabled={disabled}
                  className="!py-1.5 text-[0.84rem]"
                />
              </div>
              <div className="w-[150px]">
                <label className="field-label" htmlFor={`tier-fee-${index}`}>
                  Frete
                </label>
                <MoneyInput
                  id={`tier-fee-${index}`}
                  value={money(tier.fee)}
                  onChange={(e) =>
                    onChange(
                      tiers.map((t, i) => (i === index ? { ...t, fee: parseMoney(e.target.value) } : t)),
                    )
                  }
                  disabled={disabled}
                  className="!py-1.5 text-[0.84rem]"
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tiers.filter((_, i) => i !== index))}
                className="mb-0.5 rounded-sm px-2.5 py-2 text-[0.74rem] font-semibold text-ink-400 transition-all hover:bg-ink-100 hover:text-danger disabled:opacity-50"
                aria-label={`Remover faixa de ${tier.upToKm} km`}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** PrÃ³ximo limite sugerido, para nÃ£o repetir a mesma faixa. */
function tierSuggestion(tiers: Array<{ upToKm: number }>): number {
  const last = tiers[tiers.length - 1];
  return last ? Math.round((last.upToKm + 2) * 10) / 10 : 3;
}

function parseMoney(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Bairros com taxa de entrega.
 *
 * A lista Ã© editada linha a linha, sem arrastar. DistÃ¢ncia e coordenada
 * sÃ£o opcionais e informativas (desenho do mapa), nunca a fonte do preÃ§o:
 * o preÃ§o Ã© a taxa digitada. O nome do bairro Ã© o que o cliente informa no
 * checkout â€” por isso nÃ£o pode haver dois bairros com o mesmo nome.
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
          Cada bairro tem a prÃ³pria taxa. O cliente sÃ³ Ã© atendido se o bairro dele estiver aqui e
          ativo.
        </p>
      </div>

      <ul className="space-y-2">
        {zones.length === 0 && (
          <li className="py-1 text-[0.78rem] text-ink-400">
            Nenhum bairro cadastrado. O checkout recusa entregas atÃ© vocÃª cadastrar ao menos um.
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
                <div className="w-[120px]">
                  <label className="field-label" htmlFor="zone-edit-dist">DistÃ¢ncia (km)</label>
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
            <div className="w-[120px]">
              <label className="field-label" htmlFor="zone-new-dist">DistÃ¢ncia (km)</label>
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

