import type { APIRoute } from 'astro';
import { randomToken } from '../../lib/crypto';
import { notifyAdminEmail } from '../../lib/email';
import {
  buildFeatureSuggestionEmail,
  buildFeatureSuggestionNotification,
} from '../../lib/feature-suggestion';
import { notifyFeatureSuggestionUsers } from '../../lib/notifications';

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
    return jsonError('Please describe your idea in a bit more detail.');
  }
  if (description.length > 5000) {
    return jsonError('Description is too long.');
  }
  if (page.length > 200 || !page.startsWith('/')) {
    return jsonError('Invalid page.');
  }

  const suggestionId = randomToken(12);
  const notification = buildFeatureSuggestionNotification({
    employeeName: employee.name,
    page,
    description,
  });

  try {
    await notifyFeatureSuggestionUsers({
      ...notification,
      excludeUserId: employee.id,
      sourceId: suggestionId,
    });
  } catch (error) {
    console.error('feature suggestion notification failed', error);
  }

  const sent = await notifyAdminEmail(
    buildFeatureSuggestionEmail({
      employeeName: employee.name,
      employeeEmail: employee.email,
      page,
      description,
    }),
  );

  if (!sent) {
    return jsonError('Unable to send your suggestion right now. Please try again later.', 503);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
