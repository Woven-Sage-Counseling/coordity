import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import { notifyManagementUsers, TIMESHEET_BACKLOG_SOURCE } from '../../../lib/notifications';
import {
  buildTimesheetBacklogEmail,
  createTimesheetBacklogRequest,
  formatBacklogRequestDate,
} from '../../../lib/timesheet-backlog';
import { parseBacklogForm } from '../../../lib/timesheet-entries';
import {
  resolveTimesheetReturnTo,
  timesheetErrorResponse,
  timesheetJsonOk,
  wantsJson,
} from '../../../lib/timesheet-http';
import { formatHours, formatWorkDate } from '../../../lib/timesheet';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();

  let parsed;
  let created: { id: string; createdAt: number };
  try {
    parsed = parseBacklogForm(form);
    created = await createTimesheetBacklogRequest({
      userId: employee.id,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      notes: parsed.notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit backlog hours.';
    return timesheetErrorResponse(request, form, message);
  }

  const dateLabel = formatWorkDate(parsed.workDate);
  const hoursLabel = formatHours(parsed.minutes);

  try {
    await notifyManagementUsers({
      title: 'Timesheet backlog to review',
      body: `${employee.name} requested ${hoursLabel} for ${dateLabel}`,
      excludeUserId: employee.id,
      sourceType: TIMESHEET_BACKLOG_SOURCE,
      sourceId: created.id,
    });
  } catch (error) {
    console.error('timesheet backlog notification failed', error);
  }

  await notifyAdminEmail(
    buildTimesheetBacklogEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      notes: parsed.notes,
    }),
  );

  if (wantsJson(request)) {
    return timesheetJsonOk({
      request: {
        id: created.id,
        createdAtLabel: formatBacklogRequestDate(created.createdAt),
        dateLabel,
        hoursLabel,
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimesheetReturnTo(form, '/timesheet?backlog=1') },
  });
};
