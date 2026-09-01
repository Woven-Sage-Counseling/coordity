import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import {
  TIME_OFF_REQUEST_SOURCE,
  notifyManagementUsers,
} from '../../../lib/notifications';
import { createTimeOffRequest, formatTimeOffRequestDate } from '../../../lib/time-off-requests';
import { buildTimeOffEmail, formatTimeOffRequestEntries, parseTimeOffEntries } from '../../../lib/time-off';
import {
  resolveTimeOffReturnTo,
  timeOffErrorResponse,
  timeOffJsonOk,
  wantsJson,
} from '../../../lib/time-off-return';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const notes = String(form.get('notes') ?? '').trim();
  const json = wantsJson(request);

  let entries;
  let created: { id: string; createdAt: number };
  try {
    entries = parseTimeOffEntries(form);
    created = await createTimeOffRequest(employee.id, entries, notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit your request.';
    return timeOffErrorResponse(request, form, message);
  }

  const dateSummary = formatTimeOffRequestEntries(entries).join('; ');
  try {
    await notifyManagementUsers({
      title: 'New time off request',
      body: `${employee.name} requested time off: ${dateSummary}`,
      excludeUserId: employee.id,
      sourceType: TIME_OFF_REQUEST_SOURCE,
      sourceId: created.id,
    });
  } catch (error) {
    console.error('time off management notify failed', error);
  }

  await notifyAdminEmail(
    buildTimeOffEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      entries,
      notes,
    }),
  );

  if (json) {
    return timeOffJsonOk({
      request: {
        id: created.id,
        status: 'pending',
        createdAtLabel: formatTimeOffRequestDate(created.createdAt),
        entryLabels: formatTimeOffRequestEntries(entries),
      },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: resolveTimeOffReturnTo(form, '/time-off?sent=1') },
  });
};
