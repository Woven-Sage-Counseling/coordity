import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    await new QuickBooksProvider().syncSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks sync failed.';
    return formErrorRedirect('/financials', message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: '/financials', 'Cache-Control': 'no-store' },
  });
};
