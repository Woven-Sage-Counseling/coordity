import type { APIRoute } from 'astro';
import {
  canLookupAnyProvider,
  canSeeCredentialing,
  getProviderById,
  getProviderForUser,
  listProviderCoverage,
} from '../../../lib/credentialing';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const employee = locals.employee;
  if (!canSeeCredentialing(employee)) {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const providerId = url.searchParams.get('providerId')?.trim() ?? '';
  if (!providerId) {
    return new Response(JSON.stringify({ ok: false, error: 'Provider id is required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const provider = await getProviderById(providerId);
  if (!provider) {
    return new Response(JSON.stringify({ ok: false, error: 'Provider not found.' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  if (!canLookupAnyProvider(employee)) {
    const own = await getProviderForUser(employee!.id);
    if (!own || own.id !== provider.id) {
      return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
  }

  const coverage = await listProviderCoverage(providerId, { publicOnly: true });
  return new Response(JSON.stringify({ ok: true, coverage }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
