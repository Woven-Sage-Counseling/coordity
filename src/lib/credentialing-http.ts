import { formErrorRedirect } from './http';

export function credentialingAdminRedirect(successHash = 'credentialing', saved = false): Response {
  const location = saved
    ? `/admin?credentialingSaved=1#${successHash}`
    : `/admin#${successHash}`;
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export function credentialingAdminError(message: string): Response {
  return formErrorRedirect('/admin', message, 'credentialingError');
}
