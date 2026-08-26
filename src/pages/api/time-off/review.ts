import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { canAccessManagement } from '../../../lib/permissions';
import {
  TIME_OFF_REQUEST_SOURCE,
  deleteNotificationsBySource,
} from '../../../lib/notifications';
import { reviewTimeOffRequest } from '../../../lib/time-off-requests';

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
    await reviewTimeOffRequest(requestId, actor.id, status);
    await deleteNotificationsBySource(TIME_OFF_REQUEST_SOURCE, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not review that request.';
    return formErrorRedirect('/admin', message, 'timeOffError');
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/admin#time-off-requests' },
  });
};
