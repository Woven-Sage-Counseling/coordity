import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { getFinancialSummary } from '../../../lib/financials/summary';
import { orgIdFromLocals } from '../../../lib/organization';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasPermission(locals.employee, 'financials:view')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const summary = await getFinancialSummary(new URL(request.url).searchParams, {
    orgId: orgIdFromLocals(locals.organization),
  });
  return new Response(JSON.stringify(summary), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
