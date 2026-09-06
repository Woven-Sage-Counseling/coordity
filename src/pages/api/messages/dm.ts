import type { APIRoute } from 'astro';
import { findOrCreateDm } from '../../../lib/messages';
import { DEFAULT_ORG_ID } from '../../../lib/organization';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    let recipientId = '';
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => null)) as { recipientId?: string } | null;
      recipientId = String(payload?.recipientId ?? '').trim();
    } else {
      const form = await request.formData();
      recipientId = String(form.get('recipientId') ?? '').trim();
    }

    if (!recipientId) throw new Error('Choose someone to message.');

    const result = await findOrCreateDm({
      userId: employee.id,
      recipientId,
      orgId: DEFAULT_ORG_ID,
    });

    return new Response(JSON.stringify({ ok: true, conversationId: result.id, created: result.created }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start conversation.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
