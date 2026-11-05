import type { APIRoute } from 'astro';
import { listTasksForUser, serializeTask } from '../../../lib/tasks';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const requested = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 50;
  const tasks = await listTasksForUser(employee.id, limit);
  return new Response(JSON.stringify({ ok: true, tasks: tasks.map(serializeTask) }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
