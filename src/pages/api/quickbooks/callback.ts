import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const denied = url.searchParams.get('error');
  if (denied) {
    return formErrorRedirect('/financials', 'QuickBooks connection was cancelled.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  if (!code || !state || !realmId) {
    return formErrorRedirect('/financials', 'QuickBooks did not return a complete authorization.');
  }

  const provider = new QuickBooksProvider();
  const saved = await provider.readOauthState(state);
  if (!saved || saved.userId !== locals.employee!.id) {
    return formErrorRedirect('/financials', 'QuickBooks connection expired. Please try Connect again.');
  }

  try {
    await provider.exchangeCode(code, `${url.origin}/api/quickbooks/callback`, realmId, locals.employee!.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect QuickBooks.';
    return formErrorRedirect('/financials', message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/financials', 'Cache-Control': 'no-store' },
  });
};
