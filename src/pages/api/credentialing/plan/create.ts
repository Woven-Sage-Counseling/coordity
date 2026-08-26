import type { APIRoute } from 'astro';
import { canManageCredentialing, createInsurancePlan } from '../../../../lib/credentialing';
import { credentialingAdminError, credentialingAdminRedirect } from '../../../../lib/credentialing-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canManageCredentialing(locals.employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  try {
    await createInsurancePlan(String(form.get('groupId') ?? '').trim(), String(form.get('name') ?? ''));
  } catch (error) {
    return credentialingAdminError(error instanceof Error ? error.message : 'Could not add plan.');
  }

  return credentialingAdminRedirect();
};
