import { GoogleCalendarProvider, parseScheduleRangeParam } from './google-calendar';
import type { ScheduleRangeId, ScheduleSummary } from './types';

export async function getScheduleSummary(
  userId: string,
  rangeParam?: string | null,
): Promise<ScheduleSummary> {
  const provider = new GoogleCalendarProvider();
  const rangeId: ScheduleRangeId = parseScheduleRangeParam(rangeParam);
  return provider.getSummary(userId, rangeId);
}

export { GoogleCalendarProvider, parseScheduleRangeParam, scheduleRangeOptions } from './google-calendar';
