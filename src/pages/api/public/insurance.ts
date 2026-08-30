import type { APIRoute } from 'astro';
import { listPublicInsuranceNetworks } from '../../../lib/credentialing';
import { publicApiCorsHeaders } from '../../../lib/public-api-cors';

export const prerender = false;

export const OPTIONS: APIRoute = async ({ request }) => {
  return new Response(null, { status: 204, headers: publicApiCorsHeaders(request) });
};

export const GET: APIRoute = async ({ request }) => {
  try {
    const { inNetwork, comingSoon } = await listPublicInsuranceNetworks();
    return new Response(JSON.stringify({ ok: true, inNetwork, comingSoon }), {
      status: 200,
      headers: publicApiCorsHeaders(request, { 'cache-control': 'public, max-age=300' }),
    });
  } catch (error) {
    console.error('public insurance lookup failed', error);
    return new Response(JSON.stringify({ ok: false, error: 'Unable to load insurance plans.' }), {
      status: 500,
      headers: publicApiCorsHeaders(request, { 'cache-control': 'no-store' }),
    });
  }
};
