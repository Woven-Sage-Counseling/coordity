import type { APIRoute } from 'astro';
import { countUnreadMessages } from '../../../lib/messages';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const count = await countUnreadMessages(employee.id, orgIdFromLocals(locals.organization));
    return new Response(JSON.stringify({ ok: true, count }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load unread count.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
