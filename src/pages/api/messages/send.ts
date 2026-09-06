import type { APIRoute } from 'astro';
import { sendMessage } from '../../../lib/messages';

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
    let conversationId = '';
    let body = '';
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => null)) as {
        conversationId?: string;
        body?: string;
      } | null;
      conversationId = String(payload?.conversationId ?? '').trim();
      body = String(payload?.body ?? '');
    } else {
      const form = await request.formData();
      conversationId = String(form.get('conversationId') ?? '').trim();
      body = String(form.get('body') ?? '');
    }

    if (!conversationId) throw new Error('Conversation required.');

    const message = await sendMessage({
      conversationId,
      senderId: employee.id,
      senderName: employee.name,
      body,
    });

    return new Response(JSON.stringify({ ok: true, message }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send message.';
    const status = message === 'Conversation not found.' ? 404 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
};
