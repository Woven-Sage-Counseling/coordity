import type { APIRoute } from 'astro';
import { createAuth } from '../../lib/auth';
import { getEnv } from '../../lib/env';
import { timingSafeEqual } from '../../lib/crypto';
import { ownerExists, createInvitedAccount } from '../../lib/employees';
import { writeAuditLog } from '../../lib/audit';
import { applySetCookieHeaders, formErrorRedirect } from '../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const env = getEnv();
    if (await ownerExists()) {
      return formErrorRedirect('/bootstrap', 'An owner account already exists.');
    }

    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const name = String(form.get('name') ?? 'Woven Sage Admin');
    const password = String(form.get('password') ?? '');

    if (!env.PORTAL_BOOTSTRAP_TOKEN || !timingSafeEqual(token, env.PORTAL_BOOTSTRAP_TOKEN)) {
      return formErrorRedirect('/bootstrap', 'Invalid bootstrap token.');
    }

    if (password.length < 12) {
      return formErrorRedirect('/bootstrap', 'Password must be at least 12 characters.');
    }

    const auth = createAuth(request);
    const user = await createInvitedAccount(auth, {
      email: env.PORTAL_OWNER_EMAIL,
      name,
      password,
      roleId: 'role_owner',
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: 'employee.bootstrap_created',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: env.PORTAL_OWNER_EMAIL },
    });

    const signedIn = await auth.api.signInEmail({
      body: { email: env.PORTAL_OWNER_EMAIL, password },
      headers: request.headers,
      returnHeaders: true,
    });

    const headers = new Headers({ Location: '/', 'Cache-Control': 'no-store' });
    if ('headers' in signedIn && signedIn.headers) {
      applySetCookieHeaders(signedIn.headers, headers);
    }
    return new Response(null, { status: 303, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create the owner account.';
    console.error('bootstrap failed', error);
    return formErrorRedirect('/bootstrap', message);
  }
};
