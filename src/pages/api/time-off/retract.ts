import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import { formErrorRedirect } from '../../../lib/http';
import { retractTimeOffRequest } from '../../../lib/time-off-requests';
import { buildTimeOffRetractionEmail } from '../../../lib/time-off';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const requestId = String(form.get('requestId') ?? '').trim();
  if (!requestId) {
    return formErrorRedirect('/time-off', 'Request id is required.');
  }

  let retracted;
  try {
    retracted = await retractTimeOffRequest(requestId, employee.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to retract that request.';
    return formErrorRedirect('/time-off', message);
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
    headers: { Location: '/time-off?retracted=1' },
  });
};
