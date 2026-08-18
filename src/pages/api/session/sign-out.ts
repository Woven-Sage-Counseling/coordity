import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { applySetCookieHeaders } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = createAuth(request);
  const result = await auth.api.signOut({
    headers: request.headers,
    returnHeaders: true,
  });

  const headers = new Headers({ Location: '/sign-in', 'Cache-Control': 'no-store' });
  if ('headers' in result && result.headers) {
    applySetCookieHeaders(result.headers, headers);
  }
  return new Response(null, { status: 303, headers });
};
