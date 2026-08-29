import type { APIRoute } from 'astro';
import { listPublicInsuranceDisplay } from '../../../lib/credentialing';

export const prerender = false;

const ALLOWED_ORIGINS = new Set([
  'https://wovensage.com',
  'https://www.wovensage.com',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') ?? '';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=300',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }
  return headers;
}

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
};

export const GET: APIRoute = async ({ request }) => {
  try {
    const groups = await listPublicInsuranceDisplay();
    return new Response(JSON.stringify({ ok: true, groups }), {
      status: 200,
      headers: corsHeaders(request),
    });
  } catch (error) {
    console.error('public insurance lookup failed', error);
    return new Response(JSON.stringify({ ok: false, error: 'Unable to load insurance plans.' }), {
      status: 500,
      headers: corsHeaders(request),
    });
  }
};
