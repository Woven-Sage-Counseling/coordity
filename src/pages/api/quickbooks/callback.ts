import type { APIRoute } from 'astro';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { orgCanonicalOrigin, orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

function financialsRedirect(opts?: { error?: string }): Response {
  const params = new URLSearchParams({ outlook: '1' });
  if (opts?.error) params.set('error', opts.error);
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/financials?${params.toString()}#outlook`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET: APIRoute = async ({ locals, url, request }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const denied = url.searchParams.get('error');
  if (denied) {
    return financialsRedirect({ error: 'QuickBooks connection was cancelled.' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  if (!code || !state || !realmId) {
    return financialsRedirect({ error: 'QuickBooks did not return a complete authorization.' });
  }

  const provider = new QuickBooksProvider(orgIdFromLocals(locals.organization));
  const saved = await provider.readOauthState(state);
  if (!saved || saved.userId !== locals.employee!.id) {
    return financialsRedirect({ error: 'QuickBooks connection expired. Please try Connect again.' });
  }

  try {
    await provider.exchangeCode(
      code,
      `${orgCanonicalOrigin(locals.organization, request.url)}/api/quickbooks/callback`,
      realmId,
      locals.employee!.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect QuickBooks.';
    return financialsRedirect({ error: message });
  }

  return financialsRedirect();
};
