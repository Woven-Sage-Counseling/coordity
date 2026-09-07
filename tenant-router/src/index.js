/**
 * Proxies *.coordity.com tenant hosts to the Pages app.
 * Pages does not support wildcard custom domains, so this Worker preserves
 * the original Host via X-Forwarded-Host for org resolution + auth cookies.
 *
 * Astro CSRF compares Origin to request.url.origin. Because we fetch Pages on
 * pages.dev, we rewrite Origin for trusted Coordity hosts so form POSTs pass
 * while still rejecting foreign origins.
 */
const PAGES_HOST = 'wovensage-portal-preview.pages.dev';
const PAGES_ORIGIN = `https://${PAGES_HOST}`;

function isTrustedPublicHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === 'coordity.com' ||
    host.endsWith('.coordity.com') ||
    host === 'portal.wovensage.com'
  );
}

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.host = PAGES_HOST;

    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', 'https');
    headers.delete('accept-encoding');

    const origin = headers.get('Origin');
    if (origin) {
      try {
        const originHost = new URL(origin).hostname;
        if (isTrustedPublicHost(originHost)) {
          headers.set('Origin', PAGES_ORIGIN);
        }
      } catch {
        // leave Origin unchanged
      }
    }

    return fetch(
      new Request(target.toString(), {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      }),
    );
  },
};
