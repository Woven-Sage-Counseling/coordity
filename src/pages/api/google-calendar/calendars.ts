import type { APIRoute } from 'astro';
import { GoogleCalendarProvider, jsonResponse } from '../../../lib/schedule/google-calendar';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const provider = new GoogleCalendarProvider();
  const userId = locals.employee!.id;
  const connection = await provider.getConnection(userId);
  const calendars = await provider.listCalendars(userId);
  return jsonResponse({ connection, calendars });
};

export const POST: APIRoute = async ({ locals, request }) => {
  const provider = new GoogleCalendarProvider();
  const userId = locals.employee!.id;
  const body = (await request.json()) as { enabledIds?: string[]; refresh?: boolean };

  if (body.refresh) {
    await provider.refreshCalendarList(userId);
  }

  if (Array.isArray(body.enabledIds)) {
    const enabledIds = body.enabledIds.filter((value) => typeof value === 'string' && value.trim().length > 0);
    await provider.saveCalendarSelection(userId, enabledIds);
  }

  const connection = await provider.getConnection(userId);
  const calendars = await provider.listCalendars(userId);
  return jsonResponse({ connection, calendars });
};
