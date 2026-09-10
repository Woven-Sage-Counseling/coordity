import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { hasPlatformPermission } from '../../../../lib/platform-access';
import { restoreOrganization } from '../../../../lib/platform-orgs';

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
    await restoreOrganization(orgId);
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/platform/orgs?archived=1&saved=restored',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not restore organization.';
    return formErrorRedirect('/platform/orgs', message);
  }
};
