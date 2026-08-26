import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import {
  TIME_OFF_REQUEST_SOURCE,
  notifyManagementUsers,
} from '../../../lib/notifications';
import { createTimeOffRequest } from '../../../lib/time-off-requests';
import { buildTimeOffEmail, formatTimeOffEntry, parseTimeOffEntries } from '../../../lib/time-off';
import { resolveTimeOffReturnTo, timeOffErrorRedirect } from '../../../lib/time-off-return';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const notes = String(form.get('notes') ?? '').trim();

  let entries;
  let requestId: string;
  try {
    entries = parseTimeOffEntries(form);
    requestId = await createTimeOffRequest(employee.id, entries, notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit your request.';
    return timeOffErrorRedirect(form, message);
  }

  const dateSummary = entries.map((entry) => formatTimeOffEntry(entry)).join('; ');
  await notifyManagementUsers({
    title: 'New time off request',
    body: `${employee.name} requested time off: ${dateSummary}`,
    excludeUserId: employee.id,
    sourceType: TIME_OFF_REQUEST_SOURCE,
    sourceId: requestId,
  });

  await notifyAdminEmail(
    buildTimeOffEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      entries,
      notes,
    }),
  );

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimeOffReturnTo(form, '/time-off?sent=1') },
  });
};
