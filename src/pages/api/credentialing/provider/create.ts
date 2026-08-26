import type { APIRoute } from 'astro';
import {
  canManageCredentialing,
  createCredentialingProvider,
} from '../../../../lib/credentialing';
import { credentialingAdminError, credentialingAdminRedirect } from '../../../../lib/credentialing-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!canManageCredentialing(locals.employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  try {
    await createCredentialingProvider(
      String(form.get('name') ?? ''),
      String(form.get('userId') ?? '').trim() || null,
    );
  } catch (error) {
    return credentialingAdminError(error instanceof Error ? error.message : 'Could not add provider.');
  }

  return credentialingAdminRedirect();
};
