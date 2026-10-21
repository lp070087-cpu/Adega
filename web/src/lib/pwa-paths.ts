/** Keep installed apps on segment-bounded scopes while preserving legacy links. */
export function canonicalAppPath(pathname: string): string | null {
  const bare = pathname.replace(/\/+$/, '') || '/';
  const isAppRoot = /^\/loja\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bare) || bare === '/entregador';
  const canonical = isAppRoot ? `${bare}/` : bare;
  return canonical === pathname ? null : canonical;
}

export function requiresSessionMiddleware(pathname: string): boolean {
  return /^\/(?:app|onboarding)(?:\/|$)/.test(pathname);
}
