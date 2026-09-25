import type { APIRoute } from 'astro';
import { randomToken } from '../../../lib/crypto';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { orgCanonicalOrigin, orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const provider = new QuickBooksProvider(orgIdFromLocals(locals.organization));
  if (!(await provider.isReady())) {
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          '/admin?integrationsError=' +
          encodeURIComponent('Save your QuickBooks Client ID and Client Secret first, then click Connect.') +
          '#integrations',
      },
    });
  }

  const redirectUri = `${orgCanonicalOrigin(locals.organization, request.url)}/api/quickbooks/callback`;
  const state = randomToken(16);
  await provider.saveOauthState(state, locals.employee!.id);
  return new Response(null, {
    status: 303,
    headers: { Location: await provider.authorizationUrlForConnect(state, redirectUri) },
  });
};
