import type { APIRoute } from 'astro';
import { updateDirectoryProfile } from '../../../lib/employees';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json');
}

function accountError(request: Request, message: string, status = 400): Response {
  if (wantsJson(request)) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return formErrorRedirect('/account', message);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return wantsJson(request) ? accountError(request, 'Forbidden', 403) : new Response('Forbidden', { status: 403 });
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
      return accountError(request, 'Unknown field.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile.';
    return accountError(request, message);
  }

  if (wantsJson(request)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/account?saved=${encodeURIComponent(field)}` },
  });
};
