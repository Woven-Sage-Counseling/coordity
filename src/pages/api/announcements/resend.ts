import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { resendAnnouncement } from '../../../lib/announcements';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!canAccessManagement(actor)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  if (!id) {
    return formErrorRedirect('/admin', 'Announcement id is required.');
  }

  try {
    await resendAnnouncement({
      id,
      actorUserId: actor!.id,
    });
  } catch {
    return formErrorRedirect('/admin', 'Could not resend that announcement.');
  }

  return new Response(null, { status: 303, headers: { Location: '/admin#announcement-history' } });
};
