import type { APIRoute } from 'astro';
import { randomToken } from '../../../lib/crypto';
import { GoogleCalendarProvider } from '../../../lib/schedule/google-calendar';

export const prerender = false;

export const POST: APIRoute = async ({ locals, url, request }) => {
  const employee = locals.employee!;
  const provider = new GoogleCalendarProvider();

  if (!provider.isConfigured()) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/settings?error=' + encodeURIComponent('Google Calendar secrets are not configured.'),
      },
    });
  }

  let returnTo = '/';
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as { returnTo?: string };
      if (body.returnTo?.startsWith('/') && !body.returnTo.startsWith('//')) {
        returnTo = body.returnTo;
      }
    } catch {
      // default return path
    }
  } else {
    const form = await request.formData();
    const fromForm = form.get('returnTo');
    if (typeof fromForm === 'string' && fromForm.startsWith('/') && !fromForm.startsWith('//')) {
      returnTo = fromForm;
    }
  }

  const redirectUri = `${url.origin}/api/google-calendar/callback`;
  const state = randomToken(16);
  await provider.saveOauthState(state, employee.id, returnTo);

  return new Response(null, {
    status: 303,
    headers: { Location: provider.authorizationUrl(state, redirectUri) },
  });
};
