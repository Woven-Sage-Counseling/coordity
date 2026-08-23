import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { updateAnnouncement } from '../../../lib/announcements';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!canAccessManagement(actor)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const id = String(form.get('id') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();

  if (!id) {
    return formErrorRedirect('/admin', 'Announcement id is required.');
  }
  if (!title || !body) {
    return formErrorRedirect('/admin', 'Title and message are required.');
  }
  if (title.length > 120 || body.length > 2000) {
    return formErrorRedirect('/admin', 'Announcement is too long.');
  }

  try {
    await updateAnnouncement({
      id,
      title,
      body,
      actorUserId: actor!.id,
    });
  } catch {
    return formErrorRedirect('/admin', 'Could not update that announcement.');
  }

  return new Response(null, { status: 303, headers: { Location: '/admin#announcement-history' } });
};
