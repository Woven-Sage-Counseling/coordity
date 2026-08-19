import type { APIRoute } from 'astro';
import { hasPermission, isOwnerEmail } from '../../../lib/permissions';
import { createInvitation } from '../../../lib/invites';
import { formErrorRedirect } from '../../../lib/http';

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
    return formErrorRedirect('/admin/employees', 'Name, email, and role are required.');
  }

  if (roleId === 'role_owner' || isOwnerEmail(email)) {
    return formErrorRedirect(
      '/admin/employees',
      'Primary owner is reserved for admin@wovensage.com. Invite your mom as Owner if she should see everything without making changes.',
    );
  }

  const invite = await createInvitation({
    email,
    name,
    roleId,
    actorUserId: actor!.id,
    origin: url.origin,
  });

  const location = `/admin/employees?inviteUrl=${encodeURIComponent(invite.inviteUrl)}`;
  return new Response(null, { status: 303, headers: { Location: location } });
};
