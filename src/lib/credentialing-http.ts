import { formErrorRedirect } from './http';

export function credentialingAdminRedirect(successHash = 'credentialing'): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: `/admin#${successHash}` },
  });
}

export function credentialingAdminError(message: string): Response {
  return formErrorRedirect('/admin', message, 'credentialingError');
}
