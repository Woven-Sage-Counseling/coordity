import type { APIRoute } from 'astro';
import { availablePortalTools } from '../../../lib/portal-tools';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const tools = availablePortalTools(employee).map((tool) => ({
    id: tool.widgetId,
    label: tool.label,
    description: tool.description,
  }));

  return new Response(JSON.stringify({ ok: true, tools }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
