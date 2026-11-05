import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { orgIdFromLocals } from '../../../lib/organization';
import { saveContentReview } from '../../../lib/training';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();
  const blockId = String(form.get('blockId') ?? '').trim();
  const moduleId = String(form.get('moduleId') ?? '').trim();
  const lessonId = String(form.get('lessonId') ?? '').trim();
  const returnPath = `/training/${moduleId}/${lessonId}`;

  try {
    await saveContentReview({
      userId: employee.id,
      blockId,
      orgId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save review.';
    if ((request.headers.get('accept') ?? '').includes('application/json')) {
      return new Response(JSON.stringify({ error: message }), {
        status: 400,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }
    return formErrorRedirect(returnPath, message);
  }

  if ((request.headers.get('accept') ?? '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: `${returnPath}?review=saved`,
      'Cache-Control': 'no-store',
    },
  });
};
