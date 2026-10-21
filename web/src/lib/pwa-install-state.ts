/** Detect only this window's installed context, never a past installation in another tab. */
export function installedDisplayMode(match: (query: string) => boolean, iosStandalone = false): boolean {
  return iosStandalone || ['standalone', 'minimal-ui'].some(mode => match(`(display-mode: ${mode})`));
}

export function observeInstalledContext(target: Window, nav: Navigator, update: (installed: boolean) => void) {
  const media = ['standalone', 'minimal-ui'].map(mode => target.matchMedia(`(display-mode: ${mode})`));
  let installationConfirmed = false;
  const refresh = () => update(installationConfirmed || installedDisplayMode(query => target.matchMedia(query).matches, Boolean((nav as Navigator & { standalone?: boolean }).standalone)));
  const complete = () => { installationConfirmed = true; refresh(); };
  refresh();
  for (const query of media) query.addEventListener('change', refresh);
  target.addEventListener('appinstalled', complete);
  return () => {
    for (const query of media) query.removeEventListener('change', refresh);
    target.removeEventListener('appinstalled', complete);
  };
}
