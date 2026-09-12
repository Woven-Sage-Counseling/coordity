import type { APIRoute } from 'astro';
import { randomToken } from '../../../lib/crypto';
import {
  docusignAuthorizationUrl,
  isDocuSignConfigured,
  saveDocuSignOauthState,
} from '../../../lib/docusign';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ locals, url }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);

  if (!isDocuSignConfigured()) {
    return new Response(null, {
      status: 303,
      headers: {
        Location:
          '/admin?integrationsError=' +
          encodeURIComponent('DocuSign app credentials are not configured on this server.') +
          '#integrations',
      },
    });
  }

  const redirectUri = `${url.origin}/api/docusign/callback`;
  const state = randomToken(16);
  await saveDocuSignOauthState(state, {
    userId: locals.employee!.id,
    orgId,
    returnTo: '/admin#integrations',
  });
  return new Response(null, {
    status: 303,
    headers: { Location: docusignAuthorizationUrl(state, redirectUri) },
  });
};
