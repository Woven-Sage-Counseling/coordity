import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { GoogleCalendarProvider } from '../../../lib/schedule/google-calendar';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const denied = url.searchParams.get('error');
  if (denied) {
    return formErrorRedirect('/settings', 'Google Calendar connection was cancelled.');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return formErrorRedirect('/settings', 'Google did not return a complete authorization.');
  }

  const provider = new GoogleCalendarProvider();
  const saved = await provider.readOauthState(state);
  if (!saved || !locals.employee || saved.userId !== locals.employee.id) {
    return formErrorRedirect('/settings', 'Google Calendar connection expired. Please try Connect again.');
  }

  try {
    await provider.exchangeCode(code, `${url.origin}/api/google-calendar/callback`, saved.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect Google Calendar.';
    return formErrorRedirect(saved.returnTo || '/settings', message);
  }

  const destination = saved.returnTo.startsWith('/') ? saved.returnTo : '/settings';
  const separator = destination.includes('?') ? '&' : '?';
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${destination}${separator}calendar=connected`,
      'Cache-Control': 'no-store',
    },
  });
};
