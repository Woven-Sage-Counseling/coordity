import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { canAccessManagement } from '../../../../lib/permissions';
import { clearTimesheetBacklogRequest } from '../../../../lib/timesheet-backlog';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.employee;
  if (!actor || !canAccessManagement(actor)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '').trim();

  if (!requestId) {
    return formErrorRedirect('/admin', 'Backlog request id is required.', 'timesheetError');
  }

  try {
    await clearTimesheetBacklogRequest(requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not clear that backlog request.';
    return formErrorRedirect('/admin', message, 'timesheetError');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#timesheet-backlog' },
  });
};
