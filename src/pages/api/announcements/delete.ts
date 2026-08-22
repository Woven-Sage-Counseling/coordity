import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { deleteAnnouncement } from '../../../lib/announcements';
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
    return formErrorRedirect('/management', 'Announcement id is required.');
  }

  try {
    await deleteAnnouncement({
      id,
      actorUserId: actor!.id,
    });
  } catch {
    return formErrorRedirect('/management', 'Could not delete that announcement.');
  }

  return new Response(null, { status: 303, headers: { Location: '/management#announcement-history' } });
};
