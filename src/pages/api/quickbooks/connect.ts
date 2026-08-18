import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { randomToken } from '../../../lib/crypto';

export const prerender = false;

export const POST: APIRoute = async ({ locals, url }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const provider = new QuickBooksProvider();
  if (!provider.isConfigured()) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/financials' },
    });
  }

  const redirectUri = `${url.origin}/api/quickbooks/callback`;
  const state = randomToken(16);
  return new Response(null, {
    status: 303,
    headers: { Location: provider.authorizationUrl(state, redirectUri) },
  });
};
