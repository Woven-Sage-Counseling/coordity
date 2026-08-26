import type { APIRoute } from 'astro';
import { updateDirectoryProfile } from '../../../lib/employees';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const field = String(form.get('field') ?? '');

  try {
    if (field === 'name') {
      await updateDirectoryProfile({
        userId: actor.id,
        name: String(form.get('name') ?? ''),
        actorUserId: actor.id,
      });
    } else if (field === 'phone') {
      await updateDirectoryProfile({
        userId: actor.id,
        phone: String(form.get('phone') ?? ''),
        actorUserId: actor.id,
      });
    } else {
      return formErrorRedirect('/account', 'Unknown field.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile.';
    return formErrorRedirect('/account', message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/account?saved=${encodeURIComponent(field)}` },
  });
};
