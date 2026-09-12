import type { APIRoute } from 'astro';
import { QuickBooksProvider } from '../../../lib/financials/quickbooks';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

function integrationsRedirect(opts?: { error?: string; saved?: string }): Response {
  const params = new URLSearchParams();
  if (opts?.error) params.set('integrationsError', opts.error);
  if (opts?.saved) params.set('integrationsSaved', opts.saved);
  const qs = params.toString();
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/admin${qs ? `?${qs}` : ''}#integrations`,
      'Cache-Control': 'no-store',
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  try {
    await new QuickBooksProvider().saveAppSettings({
      clientId: String(form.get('clientId') ?? ''),
      clientSecret: String(form.get('clientSecret') ?? ''),
      environment: String(form.get('environment') ?? 'sandbox'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save QuickBooks settings.';
    return integrationsRedirect({ error: message });
  }

  return integrationsRedirect({ saved: 'quickbooks-settings' });
};
