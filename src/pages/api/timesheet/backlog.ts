import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import { notifyManagementUsers, TIMESHEET_BACKLOG_SOURCE } from '../../../lib/notifications';
import {
  buildTimesheetBacklogEmail,
  createTimesheetBacklogRequest,
  formatBacklogRequestDate,
  listTimesheetBacklogForUser,
  serializeBacklogRequest,
} from '../../../lib/timesheet-backlog';
import { parseBacklogTimeRange } from '../../../lib/timesheet-entries';
import {
  resolveTimesheetReturnTo,
  timesheetErrorResponse,
  timesheetJsonOk,
  wantsJson,
} from '../../../lib/timesheet-http';
import { formatHours, formatShiftRange, formatWorkDate } from '../../../lib/timesheet';
import { requireTimesheetAccess } from '../../../lib/timesheet-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireTimesheetAccess(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();

  let parsed;
  let created: { id: string; createdAt: number };
  try {
    parsed = parseBacklogTimeRange(form);
    created = await createTimesheetBacklogRequest({
      userId: employee.id,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      notes: parsed.notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit backlog hours.';
    return timesheetErrorResponse(request, form, message);
  }

  const dateLabel = formatWorkDate(parsed.workDate);
  const hoursLabel = formatHours(parsed.minutes);
  const timeLabel = formatShiftRange(parsed.startedAt, parsed.endedAt);

  try {
    await notifyManagementUsers({
      title: 'Timesheet backlog to review',
      body: `${employee.name} requested ${hoursLabel} (${timeLabel}) for ${dateLabel}`,
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
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      notes: parsed.notes,
    }),
  );

  if (wantsJson(request)) {
    const pendingRequests = (await listTimesheetBacklogForUser(employee.id, 50))
      .filter((request) => request.status === 'pending')
      .map(serializeBacklogRequest);

    return timesheetJsonOk({
      request: {
        id: created.id,
        createdAtLabel: formatBacklogRequestDate(created.createdAt),
        dateLabel,
        hoursLabel,
        timeLabel,
        status: 'pending',
        statusLabel: 'Pending',
      },
      requests: pendingRequests,
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimesheetReturnTo(form, '/timesheet?backlog=1') },
  });
};
