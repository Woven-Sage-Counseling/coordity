import type { APIRoute } from 'astro';
import { canAccessManagement } from '../../../../../../lib/permissions';
import { orgIdFromLocals } from '../../../../../../lib/organization';
import { getContactHeadshot } from '../../../../../../lib/training';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  const userId = String(params.userId ?? '').trim();
  const blockId = String(params.blockId ?? '').trim();
  if (employee.id !== userId && !canAccessManagement(employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const headshot = await getContactHeadshot({
    orgId: orgIdFromLocals(locals.organization),
    userId,
    blockId,
  });
  if (!headshot) return new Response('Not found', { status: 404 });

  const binary = Uint8Array.from(atob(headshot.data), (char) => char.charCodeAt(0));
  return new Response(binary, {
    status: 200,
    headers: {
      'content-type': headshot.mime,
      'cache-control': 'private, no-store',
    },
  });
};
