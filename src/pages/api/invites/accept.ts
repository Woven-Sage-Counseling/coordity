import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { getInvitationByToken, markInvitationAccepted } from '../../../lib/invites';
import { createInvitedAccount } from '../../../lib/employees';
import { applySetCookieHeaders, formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const token = String(form.get('token') ?? '');
  const password = String(form.get('password') ?? '');
  const invite = await getInvitationByToken(token);

  if (!invite) {
    return formErrorRedirect('/accept-invite', 'This invitation is invalid or expired.');
  }
  if (password.length < 12) {
    return formErrorRedirect(
      `/accept-invite?token=${encodeURIComponent(token)}`,
      'Password must be at least 12 characters.',
    );
  }

  const auth = createAuth(request);
  const user = await createInvitedAccount(auth, {
    email: invite.email,
    name: invite.name,
    password,
    roleId: invite.role_id,
  });
  await markInvitationAccepted(invite.id, user.id);

  const signedIn = await auth.api.signInEmail({
    body: { email: invite.email, password },
    headers: request.headers,
    returnHeaders: true,
  });
  const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
  if ('headers' in signedIn && signedIn.headers) {
    applySetCookieHeaders(signedIn.headers, headers);
  }
  return new Response(null, { status: 303, headers });
};
