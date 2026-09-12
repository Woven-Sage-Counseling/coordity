import type { APIRoute } from 'astro';
import { randomToken } from '../../../lib/crypto';
import {
  docusignAuthorizationUrl,
  getDocuSignAuthCredentials,
  saveDocuSignOauthState,
} from '../../../lib/docusign';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgCanonicalOrigin, orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ locals, url, request }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);

  const credentials = await getDocuSignAuthCredentials(orgId);
  if (!credentials) {
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          '/admin?integrationsError=' +
          encodeURIComponent('Save your DocuSign Integration Key and Secret Key first, then click Connect.') +
          '#integrations',
      },
    });
  }

  const redirectUri = `${orgCanonicalOrigin(locals.organization, request.url)}/api/docusign/callback`;
  const state = randomToken(16);
  await saveDocuSignOauthState(state, {
    userId: locals.employee!.id,
    orgId,
    returnTo: '/admin#integrations',
  });
  return new Response(null, {
    status: 303,
    headers: { Location: docusignAuthorizationUrl(state, redirectUri, credentials) },
  });
};
