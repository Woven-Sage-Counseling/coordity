import type { APIRoute } from 'astro';
import { createAuth } from '../../../../lib/auth';
import { applySetCookieHeaders, formErrorRedirect } from '../../../../lib/http';
import { loadPlatformStaff } from '../../../../lib/platform-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.isCoordityApex) {
    return new Response('Not found', { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!email || !password) {
    return formErrorRedirect('/platform/sign-in', 'Email and password are required.');
  }

  const auth = createAuth(request);
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    });

    const payload = 'response' in result ? result.response : result;
    const userId =
      payload && typeof payload === 'object' && 'user' in payload
        ? (payload as { user?: { id: string } }).user?.id
        : undefined;
    if (!userId) {
      return formErrorRedirect('/platform/sign-in', 'Unable to sign in.');
    }

    const staff = await loadPlatformStaff(userId);
    if (!staff || !staff.permissions.includes('platform:access')) {
      await auth.api.signOut({ headers: result.headers });
      return formErrorRedirect('/platform/sign-in', 'This account is not Coordity platform staff.');
    }

    const headers = new Headers({ Location: '/platform', 'Cache-Control': 'no-store' });
    if ('headers' in result && result.headers) {
      applySetCookieHeaders(result.headers, headers);
    }
    return new Response(null, { status: 303, headers });
  } catch {
    return formErrorRedirect('/platform/sign-in', 'Incorrect email or password.');
  }
};
