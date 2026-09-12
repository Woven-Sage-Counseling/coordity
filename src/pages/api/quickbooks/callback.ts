import type { APIRoute } from 'astro';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { orgCanonicalOrigin } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

function integrationsRedirect(opts?: { error?: string; saved?: string }): Response {
  const params = new URLSearchParams();
  if (opts?.error) params.set('integrationsError', opts.error);
  if (opts?.saved) params.set('integrationsSaved', opts.saved);
  const qs = params.toString();
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin${qs ? `?${qs}` : ''}#integrations`,
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
    return integrationsRedirect({ error: 'QuickBooks connection was cancelled.' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  if (!code || !state || !realmId) {
    return integrationsRedirect({ error: 'QuickBooks did not return a complete authorization.' });
  }

  const provider = new QuickBooksProvider();
  const saved = await provider.readOauthState(state);
  if (!saved || saved.userId !== locals.employee!.id) {
    return integrationsRedirect({ error: 'QuickBooks connection expired. Please try Connect again.' });
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
    return integrationsRedirect({ error: message });
  }

  return integrationsRedirect({ saved: 'quickbooks' });
};
