import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { canAccessManagement } from '../../../../lib/permissions';
import { clearTimesheetShiftEditRequest } from '../../../../lib/timesheet-shift-edits';
import { timesheetJsonError, timesheetJsonOk, wantsJson } from '../../../../lib/timesheet-http';

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
  const actor = locals.employee;
  if (!actor || !canAccessManagement(actor)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '').trim();

  if (!requestId) {
    const message = 'Time change request id is required.';
    if (wantsJson(request)) return timesheetJsonError(message);
    return formErrorRedirect('/admin', message, 'timesheetError');
  }

  try {
    await clearTimesheetShiftEditRequest(requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not clear that time change request.';
    if (wantsJson(request)) return timesheetJsonError(message);
    return formErrorRedirect('/admin', message, 'timesheetError');
  }

  if (wantsJson(request)) {
    return timesheetJsonOk({ requestId });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#timesheet-backlog' },
  });
};
