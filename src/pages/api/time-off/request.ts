import type { APIRoute } from 'astro';
import { sendTimeOffRequestEmail } from '../../../lib/email';
import { formErrorRedirect } from '../../../lib/http';
import { createTimeOffRequest } from '../../../lib/time-off-requests';
import { parseTimeOffEntries } from '../../../lib/time-off';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const notes = String(form.get('notes') ?? '').trim();

  try {
    const entries = parseTimeOffEntries(form);
    await createTimeOffRequest(employee.id, entries, notes);
    await sendTimeOffRequestEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      entries,
      notes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send your request.';
    return formErrorRedirect('/time-off', message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/time-off?sent=1' },
  });
};
