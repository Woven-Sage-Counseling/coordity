const EXACT_ORIGINS = new Set([
  'https://coordity.com',
  'https://www.coordity.com',
  'https://wovensage.com',
  'https://www.wovensage.com',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:4322',
  'http://127.0.0.1:4322',
]);

export function isPublicApiOrigin(origin: string): boolean {
  if (!origin) return false;
  if (EXACT_ORIGINS.has(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname === 'coordity.com' || hostname.endsWith('.coordity.com')) return true;
    if (hostname === 'wovensage.com' || hostname.endsWith('.wovensage.com')) return true;
    if (hostname.endsWith('.pages.dev') && (hostname.includes('wovensage') || hostname.includes('coordity'))) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function publicApiCorsHeaders(request: Request, extra: Record<string, string> = {}): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...extra,
  };

  if (isPublicApiOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET, OPTIONS';
    headers['access-control-allow-headers'] = 'Accept';
    headers.vary = 'Origin';
  }

  return headers;
}
