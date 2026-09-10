import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { hasPlatformPermission } from '../../../../lib/platform-access';
import { archiveOrganization } from '../../../../lib/platform-orgs';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.isCoordityApex) return new Response('Not found', { status: 404 });
  if (!hasPlatformPermission(locals.platformStaff, 'platform:orgs:delete')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const orgId = String(form.get('orgId') ?? '').trim();
  if (!orgId) return formErrorRedirect('/platform/orgs', 'Missing organization.');

  try {
    await archiveOrganization(orgId);
    return new Response(null, {
      status: 303,
      headers: { Location: '/platform/orgs?saved=archived', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not archive organization.';
    return formErrorRedirect('/platform/orgs', message);
  }
};
