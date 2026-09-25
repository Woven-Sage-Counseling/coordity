import type { APIRoute } from 'astro';
import { saveDocuSignAppSettings } from '../../../lib/docusign';
import { requireManagementAccess } from '../../../lib/management-access';
import { orgIdFromLocals } from '../../../lib/organization';

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
  const denied = requireManagementAccess(locals.employee);
  if (denied) return denied;
  const orgId = orgIdFromLocals(locals.organization);
  const form = await request.formData();

  try {
    await saveDocuSignAppSettings({
      orgId,
      integrationKey: String(form.get('integrationKey') ?? ''),
      secretKey: String(form.get('secretKey') ?? ''),
      authServer: 'demo',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save DocuSign settings.';
    return integrationsRedirect({ error: message });
  }

  return integrationsRedirect({ saved: 'docusign-settings' });
};
