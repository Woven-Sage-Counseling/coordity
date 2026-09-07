/**
 * Proxies *.coordity.com tenant hosts to the Pages app.
 * Pages does not support wildcard custom domains, so this Worker preserves
 * the original Host via X-Forwarded-Host for org resolution + auth cookies.
 */
const PAGES_HOST = 'wovensage-portal-preview.pages.dev';

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
