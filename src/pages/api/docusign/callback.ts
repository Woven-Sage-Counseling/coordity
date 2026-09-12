import type { APIRoute } from 'astro';
import { exchangeDocuSignCode, readDocuSignOauthState } from '../../../lib/docusign';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgCanonicalOrigin, orgIdFromLocals } from '../../../lib/organization';

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
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);

  const cancelled = url.searchParams.get('error');
  if (cancelled) {
    return integrationsRedirect({ error: 'DocuSign connection was cancelled.' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return integrationsRedirect({ error: 'DocuSign did not return a complete authorization.' });
  }

  const saved = await readDocuSignOauthState(state);
  if (!saved || saved.userId !== locals.employee!.id || saved.orgId !== orgId) {
    return integrationsRedirect({ error: 'DocuSign connection expired. Please try Connect again.' });
  }

  try {
    await exchangeDocuSignCode({
      orgId,
      userId: locals.employee!.id,
      code,
      redirectUri: `${orgCanonicalOrigin(locals.organization, request.url)}/api/docusign/callback`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect DocuSign.';
    return integrationsRedirect({ error: message });
  }

  return integrationsRedirect({ saved: 'docusign' });
};
