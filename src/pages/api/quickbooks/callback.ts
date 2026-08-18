import type { APIRoute } from 'astro';
import { hasPermission } from '../../../lib/permissions';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const code = url.searchParams.get('code');
  const provider = new QuickBooksProvider();
  if (!code) {
    return new Response(null, { status: 303, headers: { Location: '/financials' } });
  }

  try {
    await provider.exchangeCode(code, `${url.origin}/api/quickbooks/callback`);
  } catch {
    return new Response(null, { status: 303, headers: { Location: '/financials' } });
  }

  return new Response(null, { status: 303, headers: { Location: '/financials' } });
};
