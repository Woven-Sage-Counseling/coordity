import type { APIRoute } from 'astro';
import { endShift, getTimesheetSummary, serializeTimesheetSummary } from '../../../lib/timesheet-entries';
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

  try {
    await endShift(employee.id);
    const summary = await getTimesheetSummary(employee.id);

    if (wantsJson(request)) {
      return timesheetJsonOk({
        summary: serializeTimesheetSummary(summary),
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: resolveTimesheetReturnTo(form, '/timesheet?ended=1') },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to end your shift.';
    return timesheetErrorResponse(request, form, message);
  }
};
