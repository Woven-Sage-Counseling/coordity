import type { APIRoute } from 'astro';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  await new QuickBooksProvider(orgIdFromLocals(locals.organization)).disconnect();
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin?integrationsSaved=quickbooks-disconnected#integrations',
      'Cache-Control': 'no-store',
    },
  });
};
