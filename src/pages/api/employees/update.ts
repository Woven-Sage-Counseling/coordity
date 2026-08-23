import type { APIRoute } from 'astro';
import { canAccessManagement, hasPermission, isOwnerEmail } from '../../../lib/permissions';
import {
  assignRole,
  setEmployeeStatus,
  updateEmployeeJobTitle,
  updateEmployeeTeams,
} from '../../../lib/employees';
import { getEnv } from '../../../lib/env';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const action = String(form.get('action') ?? '');

  if (!userId) {
    return formErrorRedirect('/admin', 'Missing employee.', 'peopleError');
  }

  if (action === 'jobTitle') {
    if (!canAccessManagement(actor)) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      await updateEmployeeJobTitle({
        userId,
        jobTitle: String(form.get('jobTitle') ?? ''),
        actorUserId: actor!.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update job title.';
      return formErrorRedirect('/admin', message, 'peopleError');
    }
    return new Response(null, { status: 303, headers: { Location: '/admin#people' } });
  }

  if (action === 'teams') {
    if (!canAccessManagement(actor)) {
      return new Response('Forbidden', { status: 403 });
    }
    const teamIds = form
      .getAll('teamIds')
      .map((value) => String(value))
      .filter(Boolean);
    try {
      await updateEmployeeTeams({
        userId,
        teamIds,
        actorUserId: actor!.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update teams.';
      return formErrorRedirect('/admin', message, 'peopleError');
    }
    return new Response(null, { status: 303, headers: { Location: '/admin#people' } });
  }

  if (!hasPermission(actor, 'employees:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  if (action === 'role') {
    const roleId = String(form.get('roleId') ?? '');
    const target = await getEnv()
      .DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email) && roleId !== 'role_owner') {
      return formErrorRedirect(
        '/admin',
        'The primary owner account cannot change roles.',
        'peopleError',
      );
    }
    if ((!target || !isOwnerEmail(target.email)) && roleId === 'role_owner') {
      return formErrorRedirect(
        '/admin',
        'Primary owner is reserved for admin@wovensage.com. Use Owner for view-only access.',
        'peopleError',
      );
    }
    await assignRole({ userId, roleId, actorUserId: actor!.id });
  } else if (action === 'disable') {
    if (userId === actor!.id) {
      return formErrorRedirect('/admin', 'You cannot disable your own account.', 'peopleError');
    }
    const target = await getEnv()
      .DB.prepare(`SELECT email FROM user WHERE id = ?`)
      .bind(userId)
      .first<{ email: string }>();
    if (target && isOwnerEmail(target.email)) {
      return formErrorRedirect('/admin', 'The owner account cannot be disabled.', 'peopleError');
    }
    await setEmployeeStatus({ userId, status: 'disabled', actorUserId: actor!.id });
  } else if (action === 'enable') {
    await setEmployeeStatus({ userId, status: 'active', actorUserId: actor!.id });
  } else {
    return formErrorRedirect('/admin', 'Unknown action.', 'peopleError');
  }

  return new Response(null, { status: 303, headers: { Location: '/admin#people' } });
};
