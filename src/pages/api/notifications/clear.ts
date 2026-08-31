import type { APIRoute } from 'astro';
import { clearAllActiveNotifications, clearNotifications } from '../../../lib/notifications';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await request.json().catch(() => null)) as { all?: boolean; ids?: string[] } | null)
    : null;

  if (payload?.all) {
    const cleared = await clearAllActiveNotifications(actor.id);
    return new Response(JSON.stringify({ ok: true, cleared }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const notificationIds = Array.isArray(payload?.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string')
    : [];

  if (notificationIds.length === 0) {
    return new Response(JSON.stringify({ error: 'ids required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  await clearNotifications({
    userId: actor.id,
    notificationIds,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
