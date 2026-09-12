import type { APIRoute } from 'astro';
import { disconnectDocuSign } from '../../../lib/docusign';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);
  await disconnectDocuSign(orgId);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin?integrationsSaved=docusign-disconnected#integrations',
      'Cache-Control': 'no-store',
    },
  });
};
