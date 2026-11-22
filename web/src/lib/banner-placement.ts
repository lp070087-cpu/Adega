export type BannerDevice = 'desktop' | 'mobile';
export type BannerPlacement =
  | { kind: 'main'; device: BannerDevice }
  | { kind: 'category'; device: BannerDevice | 'both'; categoryId: string };

export function bannerPlacement(value: string): BannerPlacement | null {
  if (value === 'hero' || value === 'hero-mobile') {
    return { kind: 'main', device: value === 'hero' ? 'desktop' : 'mobile' };
  }
  const match = /^transition(?:-(desktop|mobile))?:([a-zA-Z0-9_-]{1,100})$/.exec(value);
  if (!match) return null;
  return { kind: 'category', device: match[1] ? match[1] as BannerDevice : 'both', categoryId: match[2] };
}

export function placementFor(device: BannerDevice | 'both', categoryId?: string) {
  if (categoryId !== undefined) return device === 'both' ? `transition:${categoryId}` : `transition-${device}:${categoryId}`;
  return device === 'mobile' ? 'hero-mobile' : 'hero';
}

/** Legacy category images were shared. An explicit version takes precedence on its own device. */
export function categoryBannersForDevice<T extends { placement: string }>(banners: T[], categoryId: string, device: BannerDevice) {
  const specific = banners.filter(({ placement }) => placement === placementFor(device, categoryId));
  return specific.length ? specific : banners.filter(({ placement }) => placement === placementFor('both', categoryId));
}
