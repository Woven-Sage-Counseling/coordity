import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { hasPlatformPermission } from '../../../../lib/platform-access';
import { createPlatformOrganization } from '../../../../lib/platform-orgs';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.isCoordityApex) return new Response('Not found', { status: 404 });
  const staff = locals.platformStaff;
  if (!hasPlatformPermission(staff, 'platform:orgs:create')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const companyName = String(form.get('companyName') ?? '').trim();
  const slug = String(form.get('slug') ?? '').trim();
  const websiteUrl = String(form.get('websiteUrl') ?? '').trim();
  const adminName = String(form.get('adminName') ?? '').trim();
  const adminEmail = String(form.get('adminEmail') ?? '').trim().toLowerCase();

  if (!companyName || !adminName || !adminEmail) {
    return formErrorRedirect('/platform/orgs', 'Company name, owner name, and email are required.');
  }

  try {
    const { inviteUrl } = await createPlatformOrganization({
      companyName,
      slug: slug || undefined,
      websiteUrl: websiteUrl || null,
      adminName,
      adminEmail,
      requestUrl: request.url,
      actorUserId: staff!.userId,
    });
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/platform/orgs?saved=created&inviteUrl=${encodeURIComponent(inviteUrl)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create organization.';
    return formErrorRedirect('/platform/orgs', message);
  }
};
