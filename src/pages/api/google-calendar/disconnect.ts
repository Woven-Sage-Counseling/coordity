import type { APIRoute } from 'astro';
import { GoogleCalendarProvider, jsonResponse } from '../../../lib/schedule/google-calendar';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const provider = new GoogleCalendarProvider();
  await provider.disconnect(locals.employee!.id);
  return jsonResponse({ ok: true });
};
