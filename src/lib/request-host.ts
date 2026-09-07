/** Public hostname for multi-tenant routing (Worker may proxy via pages.dev). */
export function requestHostname(request: Request, fallbackHostname?: string): string {
  const forwarded = (request.headers.get('x-forwarded-host') ?? '')
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwarded && isTrustedForwardedHost(forwarded)) {
    return forwarded.split(':')[0] ?? forwarded;
  }
  if (fallbackHostname) return fallbackHostname.toLowerCase().split(':')[0] ?? fallbackHostname;
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function requestPublicOrigin(request: Request): string {
  const host = requestHostname(request);
  if (!host) return new URL(request.url).origin;
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function isTrustedForwardedHost(host: string): boolean {
  const hostname = host.split(':')[0] ?? '';
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === 'coordity.com' || hostname.endsWith('.coordity.com')) return true;
  if (hostname === 'portal.wovensage.com') return true;
  if (hostname.endsWith('.pages.dev')) return true;
  return false;
}
