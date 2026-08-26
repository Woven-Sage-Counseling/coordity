import type { APIRoute } from 'astro';
import {
  TIME_OFF_REQUEST_SOURCE,
  deleteNotificationsBySource,
} from '../../../lib/notifications';
import { deleteDeniedTimeOffRequest } from '../../../lib/time-off-requests';
import { resolveTimeOffReturnTo, timeOffErrorRedirect } from '../../../lib/time-off-return';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '').trim();
  if (!requestId) {
    return timeOffErrorRedirect(form, 'Request id is required.');
  }

  try {
    await deleteDeniedTimeOffRequest(requestId, employee.id);
    await deleteNotificationsBySource(TIME_OFF_REQUEST_SOURCE, `${requestId}:denied`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete that request.';
    return timeOffErrorRedirect(form, message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimeOffReturnTo(form, '/time-off?deleted=1') },
  });
};
