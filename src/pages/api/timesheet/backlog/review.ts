import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../../lib/http';
import { canAccessManagement } from '../../../../lib/permissions';
import {
  deleteNotificationsBySource,
  notifyUser,
  TIMESHEET_BACKLOG_SOURCE,
} from '../../../../lib/notifications';
import { reviewTimesheetBacklogRequest } from '../../../../lib/timesheet-backlog';
import { formatHours, formatWorkDate } from '../../../../lib/timesheet';

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
    return formErrorRedirect('/admin', 'Backlog request id is required.', 'timesheetError');
  }

  const status = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : null;
  if (!status) {
    return formErrorRedirect('/admin', 'Unknown review action.', 'timesheetError');
  }

  try {
    const reviewed = await reviewTimesheetBacklogRequest(requestId, actor.id, status);
    await deleteNotificationsBySource(TIMESHEET_BACKLOG_SOURCE, requestId);

    const dateLabel = formatWorkDate(reviewed.workDate);
    const hoursLabel = formatHours(reviewed.minutes);
    const approved = status === 'approved';

    await notifyUser({
      userId: reviewed.userId,
      title: approved ? 'Backlog hours approved' : 'Backlog hours denied',
      body: approved
        ? `Your backlog request for ${hoursLabel} on ${dateLabel} was approved.`
        : `Your backlog request for ${hoursLabel} on ${dateLabel} was denied.`,
      sourceType: TIMESHEET_BACKLOG_SOURCE,
      sourceId: `${requestId}:${status}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not review that backlog request.';
    return formErrorRedirect('/admin', message, 'timesheetError');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#timesheet-backlog' },
  });
};
