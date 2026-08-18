import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { assignRole, setEmployeeStatus } from '../../../lib/employees';
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
    return formErrorRedirect('/admin/employees', 'Missing employee.');
  }

  if (action === 'role') {
    const roleId = String(form.get('roleId') ?? '');
    await assignRole({ userId, roleId, actorUserId: actor!.id });
  } else if (action === 'disable') {
    if (userId === actor!.id) {
      return formErrorRedirect('/admin/employees', 'You cannot disable your own account.');
    }
    await setEmployeeStatus({ userId, status: 'disabled', actorUserId: actor!.id });
  } else if (action === 'enable') {
    await setEmployeeStatus({ userId, status: 'active', actorUserId: actor!.id });
  } else {
    return formErrorRedirect('/admin/employees', 'Unknown action.');
  }

  return new Response(null, { status: 303, headers: { Location: '/admin/employees' } });
};
