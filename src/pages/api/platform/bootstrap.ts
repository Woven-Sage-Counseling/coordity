import type { APIRoute } from 'astro';
import { createAuth } from '../../../lib/auth';
import { getEnv } from '../../../lib/env';
import { timingSafeEqual } from '../../../lib/crypto';
import { writeAuditLog } from '../../../lib/audit';
import { applySetCookieHeaders, formErrorRedirect } from '../../../lib/http';
import { platformOwnerExists } from '../../../lib/platform-access';
import { createPlatformOwnerAccount } from '../../../lib/platform-bootstrap';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.isCoordityApex) {
    return new Response('Not found', { status: 404 });
  }

  try {
    if (await platformOwnerExists()) {
      return formErrorRedirect('/platform/bootstrap', 'A platform owner already exists.');
    }

    const env = getEnv();
    const form = await request.formData();
    const token = String(form.get('token') ?? '');
    const name = String(form.get('name') ?? 'Coordity Admin').trim();
    const password = String(form.get('password') ?? '');
    const expected =
      (env.COORDITY_PLATFORM_BOOTSTRAP_TOKEN ?? env.PORTAL_BOOTSTRAP_TOKEN ?? '').trim();
    const ownerEmail = (env.COORDITY_PLATFORM_OWNER_EMAIL ?? 'admin@coordity.com').trim().toLowerCase();

    if (!expected || !timingSafeEqual(token, expected)) {
      return formErrorRedirect('/platform/bootstrap', 'Invalid bootstrap token.');
    }
    if (password.length < 12) {
      return formErrorRedirect('/platform/bootstrap', 'Password must be at least 12 characters.');
    }

    const auth = createAuth(request);
    const user = await createPlatformOwnerAccount(auth, {
      email: ownerEmail,
      name,
      password,
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: 'platform.bootstrap_created',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: ownerEmail },
    });

    const signedIn = await auth.api.signInEmail({
      body: { email: ownerEmail, password },
      headers: request.headers,
      returnHeaders: true,
    });

    const headers = new Headers({ Location: '/platform', 'Cache-Control': 'no-store' });
    if ('headers' in signedIn && signedIn.headers) {
      applySetCookieHeaders(signedIn.headers, headers);
    }
    return new Response(null, { status: 303, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to bootstrap platform owner.';
    console.error('platform bootstrap failed', error);
    return formErrorRedirect('/platform/bootstrap', message);
  }
};
