import type { APIRoute } from 'astro';
import {
  canManageCredentialing,
  setProviderPlanCoverage,
  type CoverageStatus,
} from '../../../../lib/credentialing';
import { credentialingAdminError, credentialingAdminRedirect } from '../../../../lib/credentialing-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!canManageCredentialing(employee)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const statusRaw = String(form.get('status') ?? '').trim();
  const status =
    statusRaw === 'accepted' || statusRaw === 'credentialing' || statusRaw === 'none'
      ? statusRaw
      : null;

  if (!status) {
    return credentialingAdminError('Choose a valid coverage status.');
  }

  try {
    await setProviderPlanCoverage({
      providerId: String(form.get('providerId') ?? '').trim(),
      planId: String(form.get('planId') ?? '').trim(),
      status: status as CoverageStatus | 'none',
      actorId: employee!.id,
    });
  } catch (error) {
    return credentialingAdminError(error instanceof Error ? error.message : 'Could not save coverage.');
  }

  return credentialingAdminRedirect();
};
