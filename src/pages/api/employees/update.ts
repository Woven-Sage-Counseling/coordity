import type { APIRoute } from 'astro';
import { hasPermission, isOwnerEmail } from '../../../lib/permissions';
import { assignRole, setEmployeeStatus } from '../../../lib/employees';
import { getEnv } from '../../../lib/env';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!hasPermission(actor, 'employees:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const action = String(form.get('action') ?? '');

  if (!userId) {
    return formErrorRedirect('/management', 'Missing employee.', 'peopleError');
  }

  if (action === 'role') {
    const roleId = String(form.get('roleId') ?? '');
    const target = await getEnv()
      .DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email) && roleId !== 'role_owner') {
      return formErrorRedirect(
        '/management',
        'The primary owner account cannot change roles.',
        'peopleError',
      );
    }
    if ((!target || !isOwnerEmail(target.email)) && roleId === 'role_owner') {
      return formErrorRedirect(
        '/management',
        'Primary owner is reserved for admin@wovensage.com. Use Owner for view-only access.',
        'peopleError',
      );
    }
    await assignRole({ userId, roleId, actorUserId: actor!.id });
  } else if (action === 'disable') {
    if (userId === actor!.id) {
      return formErrorRedirect('/management', 'You cannot disable your own account.', 'peopleError');
    }
    const target = await getEnv()
      .DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email)) {
      return formErrorRedirect('/management', 'The owner account cannot be disabled.', 'peopleError');
    }
    await setEmployeeStatus({ userId, status: 'disabled', actorUserId: actor!.id });
  } else if (action === 'enable') {
    await setEmployeeStatus({ userId, status: 'active', actorUserId: actor!.id });
  } else {
    return formErrorRedirect('/management', 'Unknown action.', 'peopleError');
  }

  return new Response(null, { status: 303, headers: { Location: '/management#people' } });
};
