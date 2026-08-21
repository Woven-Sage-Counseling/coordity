import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../lib/permissions';
import { archiveAnnouncement } from '../../../lib/announcements';
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

  await archiveAnnouncement({
    id,
    actorUserId: actor!.id,
  });

  return new Response(null, { status: 303, headers: { Location: '/management#announcements-heading' } });
};
