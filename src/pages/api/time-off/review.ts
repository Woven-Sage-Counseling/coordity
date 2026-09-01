import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { canAccessManagement } from '../../../lib/permissions';
import {
  TIME_OFF_REQUEST_SOURCE,
  deleteNotificationsBySource,
  notifyUser,
} from '../../../lib/notifications';
import { reviewTimeOffRequest } from '../../../lib/time-off-requests';
import { formatTimeOffRequestEntries } from '../../../lib/time-off';

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
    return formErrorRedirect('/admin', 'Time off request id is required.', 'timeOffError');
  }

  const status = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : null;
  if (!status) {
    return formErrorRedirect('/admin', 'Unknown review action.', 'timeOffError');
  }

  try {
    const reviewed = await reviewTimeOffRequest(requestId, actor.id, status);
    await deleteNotificationsBySource(TIME_OFF_REQUEST_SOURCE, requestId);

    const dateSummary = formatTimeOffRequestEntries(
      reviewed.entries.map((entry) => ({
        date: entry.date,
        fullDay: entry.fullDay,
        startTime: entry.startTime,
        endTime: entry.endTime,
      })),
    ).join('; ');
    const approved = status === 'approved';
    await notifyUser({
      userId: reviewed.userId,
      title: approved ? 'Time off approved' : 'Time off denied',
      body: approved
        ? `Your time off request was approved: ${dateSummary}`
        : `Your time off request was denied: ${dateSummary}`,
      sourceType: TIME_OFF_REQUEST_SOURCE,
      sourceId: `${requestId}:${status}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not review that request.';
    return formErrorRedirect('/admin', message, 'timeOffError');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#time-off-requests' },
  });
};
