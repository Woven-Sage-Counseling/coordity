import type { APIRoute } from 'astro';
import { rejectBulletinBoardRequest } from '../../../../lib/bulletin-board';
import { requirePortalOwner } from '../../../../lib/owner-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requirePortalOwner(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();
  try {
    await rejectBulletinBoardRequest({
      id: String(form.get('id') ?? '').trim(),
      reviewedBy: employee.id,
      note: String(form.get('note') ?? ''),
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reject request.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
