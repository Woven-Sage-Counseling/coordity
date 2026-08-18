import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { loadEmployee } from '../../../lib/permissions';
import { applySetCookieHeaders, formErrorRedirect } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (!email || !password) {
    return formErrorRedirect('/sign-in', 'Email and password are required.');
  }

  const auth = createAuth(request);
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    });

    const payload = 'response' in result ? result.response : result;
    const userId = payload && typeof payload === 'object' && 'user' in payload
      ? (payload as { user?: { id: string } }).user?.id
      : undefined;
    if (!userId) {
      return formErrorRedirect('/sign-in', 'Unable to sign in.');
    }

    const employee = await loadEmployee(userId);
    if (!employee || employee.status !== 'active' || !employee.permissions.includes('portal:access')) {
      await auth.api.signOut({ headers: result.headers });
      return formErrorRedirect('/sign-in', 'This account does not have portal access.');
    }

    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    if ('headers' in result && result.headers) {
      applySetCookieHeaders(result.headers, headers);
    }
    return new Response(null, { status: 303, headers });
  } catch {
    return formErrorRedirect('/sign-in', 'Incorrect email or password.');
  }
};
