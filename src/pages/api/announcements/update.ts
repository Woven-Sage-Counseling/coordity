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
    return formErrorRedirect('/management', 'Announcement id is required.');
  }
  if (!title || !body) {
    return formErrorRedirect('/management', 'Title and message are required.');
  }
  if (title.length > 120 || body.length > 2000) {
    return formErrorRedirect('/management', 'Announcement is too long.');
  }

  try {
    await updateAnnouncement({
      id,
      title,
      body,
      actorUserId: actor!.id,
    });
  } catch {
    return formErrorRedirect('/management', 'Could not update that announcement.');
  }

  return new Response(null, { status: 303, headers: { Location: '/management#announcement-history' } });
};
