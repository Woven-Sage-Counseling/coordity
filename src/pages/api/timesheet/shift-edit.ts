import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import { notifyManagementUsers, TIMESHEET_SHIFT_EDIT_SOURCE } from '../../../lib/notifications';
import {
  buildTimesheetShiftEditEmail,
  createTimesheetShiftEditRequest,
  formatShiftEditRequestDate,
  listTimesheetShiftEditsForUser,
  parseShiftEditTimeRange,
  serializeShiftEditRequest,
} from '../../../lib/timesheet-shift-edits';
import { getShiftForUser } from '../../../lib/timesheet-entries';
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
    parsed = parseShiftEditTimeRange(form);
    created = await createTimesheetShiftEditRequest({
      userId: employee.id,
      shiftId: parsed.shiftId,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      notes: parsed.notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit time change request.';
    return timesheetErrorResponse(request, form, message);
  }

  const shift = await getShiftForUser(parsed.shiftId, employee.id);
  const dateLabel = formatWorkDate(parsed.workDate);
  const hoursLabel = formatHours(parsed.minutes);
  const timeLabel = formatShiftRange(parsed.startedAt, parsed.endedAt);

  try {
    await notifyManagementUsers({
      title: 'Timesheet time change to review',
      body: `${employee.name} requested ${timeLabel} (${hoursLabel}) for ${dateLabel}`,
      excludeUserId: employee.id,
      sourceType: TIMESHEET_SHIFT_EDIT_SOURCE,
      sourceId: created.id,
    });
  } catch (error) {
    console.error('timesheet shift edit notification failed', error);
  }

  await notifyAdminEmail(
    buildTimesheetShiftEditEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      workDate: parsed.workDate,
      minutes: parsed.minutes,
      startedAt: parsed.startedAt,
      endedAt: parsed.endedAt,
      previousStartedAt: shift?.startedAt ?? null,
      previousEndedAt: shift?.endedAt ?? null,
      previousMinutes: shift?.minutes ?? 0,
      notes: parsed.notes,
    }),
  );

  if (wantsJson(request)) {
    const pendingRequests = (await listTimesheetShiftEditsForUser(employee.id, 50))
      .filter((request) => request.status === 'pending')
      .map(serializeShiftEditRequest);

    return timesheetJsonOk({
      request: {
        id: created.id,
        shiftId: parsed.shiftId,
        createdAtLabel: formatShiftEditRequestDate(created.createdAt),
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
    headers: { Location: resolveTimesheetReturnTo(form, '/timesheet?shiftEdit=1') },
  });
};
