import type { APIRoute } from 'astro';
import {
  getWeekSummary,
  serializeTimesheetEntry,
  serializeWeekSummary,
  upsertTimesheetEntry,
} from '../../../lib/timesheet-entries';
import { parseTimesheetForm } from '../../../lib/timesheet';
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

  let parsed;
  try {
    parsed = parseTimesheetForm(form);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save that entry.';
    return timesheetErrorResponse(request, form, message);
  }

  let entry;
  try {
    entry = await upsertTimesheetEntry({
      userId: employee.id,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      notes: parsed.notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save that entry.';
    return timesheetErrorResponse(request, form, message);
  }

  if (wantsJson(request)) {
    const week = await getWeekSummary(employee.id);
    return timesheetJsonOk({
      entry: serializeTimesheetEntry(entry),
      week: serializeWeekSummary(week),
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: resolveTimesheetReturnTo(form, '/timesheet?saved=1'),
    },
  });
};
