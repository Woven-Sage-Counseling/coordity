import type { APIRoute } from 'astro';
import {
  deleteTimesheetEntry,
  getWeekSummary,
  serializeWeekSummary,
} from '../../../lib/timesheet-entries';
import {
  resolveTimesheetReturnTo,
  timesheetErrorResponse,
  timesheetJsonOk,
  wantsJson,
} from '../../../lib/timesheet-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const entryId = String(form.get('entryId') ?? '').trim();

  if (!entryId) {
    return timesheetErrorResponse(request, form, 'Entry not found.');
  }

  try {
    await deleteTimesheetEntry(entryId, employee.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete that entry.';
    return timesheetErrorResponse(request, form, message);
  }

  if (wantsJson(request)) {
    const week = await getWeekSummary(employee.id);
    return timesheetJsonOk({
      entryId,
      week: serializeWeekSummary(week),
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: resolveTimesheetReturnTo(form, '/timesheet?deleted=1'),
    },
  });
};
