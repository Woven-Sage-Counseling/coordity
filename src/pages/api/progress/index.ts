import type { APIRoute } from 'astro';
import { orgIdFromLocals } from '../../../lib/organization';
import { listProgressTracksForUser, overallProgress } from '../../../lib/progress';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const tracks = await listProgressTracksForUser(employee.id, {
    orgId: orgIdFromLocals(locals.organization),
    roleKeys: employee.roles,
  });
  const overall = overallProgress(tracks);

  return new Response(JSON.stringify({ ok: true, overall, tracks }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
