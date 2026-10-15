import type { APIRoute } from 'astro';
import { listAnnouncementsForUser } from '../../lib/announcements';
import { listNotificationsForUser } from '../../lib/notifications';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const [announcements, notifications] = await Promise.all([
    listAnnouncementsForUser(employee.id, 40).catch(() => []),
    listNotificationsForUser(employee.id, 40).catch(() => []),
  ]);

  return new Response(
    JSON.stringify({
      ok: true,
      announcements: announcements.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        authorName: item.authorName,
        createdAt: item.createdAt,
        unread: item.unread === true,
      })),
      notifications: notifications.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt,
        unread: item.unread,
      })),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
