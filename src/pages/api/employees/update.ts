import type { APIRoute } from 'astro';
import { canAccessManagement, hasPermission } from '../../../lib/permissions';
import {
  assignRole,
  countActiveOwners,
  setEmployeeStatus,
  updateEmployeeJobTitle,
  updateEmployeeTeams,
  userHasOwnerRole,
} from '../../../lib/employees';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  const form = await request.formData();
  const userId = String(form.get('userId') ?? '');
  const action = String(form.get('action') ?? '');
  const orgId = orgIdFromLocals(locals.organization);

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
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin?peopleSaved=${encodeURIComponent(action)}&peopleUser=${encodeURIComponent(userId)}#people`,
      },
    });
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
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/admin?peopleSaved=${encodeURIComponent(action)}&peopleUser=${encodeURIComponent(userId)}#people`,
      },
    });
  }

  if (!hasPermission(actor, 'employees:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  if (action === 'role') {
    const roleId = String(form.get('roleId') ?? '');
    if (!roleId) {
      return formErrorRedirect('/admin', 'Role is required.', 'peopleError');
    }
    const wasOwner = await userHasOwnerRole(userId);
    const becomingOwner = roleId === 'role_owner';
    if (wasOwner && !becomingOwner) {
      const owners = await countActiveOwners(orgId);
      if (owners <= 1) {
        return formErrorRedirect(
          '/admin',
          'Keep at least one active owner for this workspace.',
          'peopleError',
        );
      }
    }
    await assignRole({ userId, roleId, actorUserId: actor!.id });
  } else if (action === 'disable') {
    if (userId === actor!.id) {
      return formErrorRedirect('/admin', 'You cannot disable your own account.', 'peopleError');
    }
    if (await userHasOwnerRole(userId)) {
      const owners = await countActiveOwners(orgId);
      if (owners <= 1) {
        return formErrorRedirect(
          '/admin',
          'Keep at least one active owner for this workspace.',
          'peopleError',
        );
      }
    }
    await setEmployeeStatus({ userId, status: 'disabled', actorUserId: actor!.id });
  } else if (action === 'enable') {
    await setEmployeeStatus({ userId, status: 'active', actorUserId: actor!.id });
  } else {
    return formErrorRedirect('/admin', 'Unknown action.', 'peopleError');
  }

  return new Response(null, { status: 303, headers: { Location: '/admin#people' } });
};
