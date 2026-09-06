import type { APIRoute } from 'astro';
import { getThread } from '../../../lib/messages';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const id = String(url.searchParams.get('id') ?? '').trim();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Conversation id required.' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const beforeRaw = url.searchParams.get('before');
  const before = beforeRaw ? Number(beforeRaw) : null;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const markRead = url.searchParams.get('markRead') !== '0';

  try {
    const thread = await getThread({
      conversationId: id,
      userId: employee.id,
      before: before != null && Number.isFinite(before) ? before : null,
      limit,
      markRead,
    });
    return new Response(JSON.stringify({ ok: true, ...thread }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load thread.';
    const status = message === 'Conversation not found.' ? 404 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
};
