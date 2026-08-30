import type { APIRoute } from 'astro';
import { todayEastern } from '../../../lib/financials/periods';
import {
  GoogleCalendarProvider,
  jsonResponse,
  parseScheduleRangeParam,
} from '../../../lib/schedule/google-calendar';
import {
  anchorDateForRange,
  parseScheduleAnchorParam,
  resolveScheduleRangeAt,
} from '../../../lib/schedule/range';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const provider = new GoogleCalendarProvider();
  const userId = locals.employee!.id;
  const rangeId = parseScheduleRangeParam(url.searchParams.get('range'));
  const anchorParam = parseScheduleAnchorParam(url.searchParams.get('anchor'));
  const anchor = anchorParam ?? anchorDateForRange(rangeId, todayEastern());
  const range = resolveScheduleRangeAt(rangeId, anchor);
  const connection = await provider.getConnection(userId);

  if (connection.status !== 'connected') {
    return jsonResponse({ connection, range, events: [] });
  }

  try {
    const events = await provider.getEvents(userId, range);
    return jsonResponse({ connection, range, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load calendar events.';
    return jsonResponse(
      {
        connection: { ...connection, status: 'error', lastError: message },
        range,
        events: [],
      },
      502,
    );
  }
};
