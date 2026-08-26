import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import {
  TIME_OFF_REQUEST_SOURCE,
  deleteNotificationsBySource,
} from '../../../lib/notifications';
import { retractTimeOffRequest } from '../../../lib/time-off-requests';
import { buildTimeOffRetractionEmail } from '../../../lib/time-off';
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

  let retracted;
  try {
    retracted = await retractTimeOffRequest(requestId, employee.id);
    await deleteNotificationsBySource(TIME_OFF_REQUEST_SOURCE, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retract that request.';
    return timeOffErrorRedirect(form, message);
  }

  await notifyAdminEmail(
    buildTimeOffRetractionEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      entries: retracted.entries.map((entry) => ({
        date: entry.date,
        fullDay: entry.fullDay,
        startTime: entry.startTime,
        endTime: entry.endTime,
      })),
      notes: retracted.notes ?? '',
    }),
  );

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimeOffReturnTo(form, '/time-off?retracted=1') },
  });
};
