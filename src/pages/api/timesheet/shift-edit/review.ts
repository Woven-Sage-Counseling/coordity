import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { canAccessManagement } from '../../../../lib/permissions';
import {
  deleteNotificationsBySource,
  notifyUser,
  TIMESHEET_SHIFT_EDIT_SOURCE,
} from '../../../../lib/notifications';
import { reviewTimesheetShiftEditRequest } from '../../../../lib/timesheet-shift-edits';
import { formatHours, formatShiftRange, formatWorkDate } from '../../../../lib/timesheet';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || !canAccessManagement(actor)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();

  if (!requestId) {
    return formErrorRedirect('/admin', 'Time change request id is required.', 'timesheetError');
  }

  const status = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : null;
  if (!status) {
    return formErrorRedirect('/admin', 'Unknown review action.', 'timesheetError');
  }

  try {
    const reviewed = await reviewTimesheetShiftEditRequest(requestId, actor.id, status);
    await deleteNotificationsBySource(TIMESHEET_SHIFT_EDIT_SOURCE, requestId);

    const dateLabel = formatWorkDate(reviewed.workDate);
    const hoursLabel = formatHours(reviewed.minutes);
    const timeLabel = formatShiftRange(reviewed.startedAt, reviewed.endedAt);
    const approved = status === 'approved';

    await notifyUser({
      userId: reviewed.userId,
      title: approved ? 'Time change approved' : 'Time change denied',
      body: approved
        ? `Your time change to ${timeLabel} (${hoursLabel}) on ${dateLabel} was approved.`
        : `Your time change request for ${dateLabel} was denied.`,
      sourceType: TIMESHEET_SHIFT_EDIT_SOURCE,
      sourceId: `${requestId}:${status}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not review that time change request.';
    return formErrorRedirect('/admin', message, 'timesheetError');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#timesheet-backlog' },
  });
};
