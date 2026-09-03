import type { APIRoute } from 'astro';
import { removeBulletinBoardPin } from '../../../../lib/bulletin-board';
import { requirePortalOwner } from '../../../../lib/owner-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requirePortalOwner(locals.employee);
  if (denied) return denied;

  const form = await request.formData();
  try {
    await removeBulletinBoardPin(String(form.get('id') ?? '').trim());
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove pin.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
