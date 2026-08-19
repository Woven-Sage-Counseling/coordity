import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { getFinancialSummary } from '../../../lib/financials/summary';

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasPermission(locals.employee, 'financials:view')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const summary = await getFinancialSummary(new URL(request.url).searchParams);
  return new Response(JSON.stringify(summary), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
