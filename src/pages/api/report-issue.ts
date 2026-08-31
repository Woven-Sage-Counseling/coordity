import type { APIRoute } from 'astro';
import { randomToken } from '../../lib/crypto';
import { notifyAdminEmail } from '../../lib/email';
import { buildIssueReportEmail, buildIssueReportNotification } from '../../lib/issue-report';
import { notifyIssueReportUsers } from '../../lib/notifications';

export const prerender = false;

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return jsonError('Forbidden', 403);
  }

  const form = await request.formData();
  const description = String(form.get('description') ?? '').trim();
  const page = String(form.get('page') ?? '/').trim() || '/';

  if (description.length < 10) {
    return jsonError('Please describe the issue in a bit more detail.');
  }
  if (description.length > 5000) {
    return jsonError('Description is too long.');
  }
  if (page.length > 200 || !page.startsWith('/')) {
    return jsonError('Invalid page.');
  }

  const reportId = randomToken(12);
  const notification = buildIssueReportNotification({
    employeeName: employee.name,
    page,
    description,
  });

  try {
    await notifyIssueReportUsers({
      ...notification,
      excludeUserId: employee.id,
      sourceId: reportId,
    });
  } catch (error) {
    console.error('issue report notification failed', error);
  }

  const sent = await notifyAdminEmail(
    buildIssueReportEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      page,
      description,
    }),
  );

  if (!sent) {
    return jsonError('Unable to send your report right now. Please try again later.', 503);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
