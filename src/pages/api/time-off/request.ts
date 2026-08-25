import type { APIRoute } from 'astro';
import { notifyAdminEmail } from '../../../lib/email';
import { formErrorRedirect } from '../../../lib/http';
import { createTimeOffRequest } from '../../../lib/time-off-requests';
import { buildTimeOffEmail, parseTimeOffEntries } from '../../../lib/time-off';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const notes = String(form.get('notes') ?? '').trim();

  let entries;
  try {
    entries = parseTimeOffEntries(form);
    await createTimeOffRequest(employee.id, entries, notes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit your request.';
    return formErrorRedirect('/time-off', message);
  }

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
    headers: { Location: '/time-off?sent=1' },
  });
};
