/**
 * Dados de apresentação do banner que não têm coluna própria em StoreBanner:
 * texto do botão (CTA) e ponto de enquadramento da imagem. Ficam em
 * Organization.settings.bannerMeta[bannerId], sem migração de banco.
 */
export type BannerMeta = { cta: string | null; focusX: number; focusY: number };
export const DEFAULT_BANNER_META: BannerMeta = { cta: null, focusX: 50, focusY: 50 };

const clamp = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 50);

export function readBannerMeta(settings: unknown, bannerId: string): BannerMeta {
  const all = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).bannerMeta : null;
  const raw = all && typeof all === 'object' && !Array.isArray(all) ? (all as Record<string, unknown>)[bannerId] : null;
  if (!raw || typeof raw !== 'object') return DEFAULT_BANNER_META;
  const meta = raw as Record<string, unknown>;
  const cta = typeof meta.cta === 'string' && meta.cta.trim() ? meta.cta.trim().slice(0, 30) : null;
  return { cta, focusX: clamp(meta.focusX), focusY: clamp(meta.focusY) };
}

/** `object-position` para o enquadramento escolhido. */
export const bannerObjectPosition = (meta: BannerMeta) => `${meta.focusX}% ${meta.focusY}%`;
