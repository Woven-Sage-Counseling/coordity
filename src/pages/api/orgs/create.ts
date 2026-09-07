import type { APIRoute } from 'astro';
import { createInvitation } from '../../../lib/invites';
import { formErrorRedirect } from '../../../lib/http';
import {
  COORDITY_SYSTEM_USER_ID,
  createOrganization,
  normalizeOrgSlug,
  tenantOrigin,
} from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const companyName = String(form.get('companyName') ?? '').trim();
  const slugRaw = String(form.get('slug') ?? '').trim() || companyName;
  const websiteUrl = String(form.get('websiteUrl') ?? '').trim();
  const adminName = String(form.get('adminName') ?? '').trim();
  const adminEmail = String(form.get('adminEmail') ?? '').trim().toLowerCase();

  if (!companyName || !adminName || !adminEmail) {
    return formErrorRedirect('/sign-up', 'Company name, your name, and email are required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return formErrorRedirect('/sign-up', 'Enter a valid work email.');
  }

  try {
    const org = await createOrganization({
      name: companyName,
      slug: normalizeOrgSlug(slugRaw),
      displayName: companyName,
      websiteUrl: websiteUrl || null,
    });

    const origin = tenantOrigin(org.slug, request.url);
    const invite = await createInvitation({
      email: adminEmail,
      name: adminName,
      roleId: 'role_owner',
      actorUserId: COORDITY_SYSTEM_USER_ID,
      origin,
      orgId: org.id,
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: invite.inviteUrl,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create workspace.';
    return formErrorRedirect('/sign-up', message);
  }
};
