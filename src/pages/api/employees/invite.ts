import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { createInvitation } from '../../../lib/invites';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const actor = locals.employee;
  if (!hasPermission(actor, 'employees:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const roleId = String(form.get('roleId') ?? '');

  if (!name || !email || !roleId) {
    return formErrorRedirect('/admin', 'Name, email, and role are required.', 'peopleError');
  }

  try {
    const invite = await createInvitation({
      email,
      name,
      roleId,
      actorUserId: actor!.id,
      origin: url.origin,
      orgId: orgIdFromLocals(locals.organization),
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin?inviteUrl=${encodeURIComponent(invite.inviteUrl)}#people`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create invite.';
    return formErrorRedirect('/admin', message, 'peopleError');
  }
};
