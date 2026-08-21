import type { APIRoute } from 'astro';
import { markAnnouncementsRead } from '../../../lib/announcements';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const actor = locals.employee;
  if (!actor || actor.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let announcementIds: string[] | undefined;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await request.json().catch(() => null)) as { ids?: string[] } | null;
    if (Array.isArray(payload?.ids)) {
      announcementIds = payload.ids.filter((id): id is string => typeof id === 'string');
    }
  }

  await markAnnouncementsRead({
    userId: actor.id,
    announcementIds,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
