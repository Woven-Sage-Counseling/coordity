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
  const name = String(form.get('name') ?? '');
  const jobTitle = String(form.get('jobTitle') ?? '');
  const phone = String(form.get('phone') ?? '');

  try {
    await updateDirectoryProfile({
      userId: actor.id,
      name,
      jobTitle,
      phone,
      actorUserId: actor.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile.';
    return formErrorRedirect('/account', message);
  }

  return new Response(null, { status: 303, headers: { Location: '/account' } });
};
