import type { APIRoute } from 'astro';
import { listTasksForUser, serializeTask } from '../../../lib/tasks';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const tasks = await listTasksForUser(employee.id, 50);
  return new Response(JSON.stringify({ ok: true, tasks: tasks.map(serializeTask) }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
