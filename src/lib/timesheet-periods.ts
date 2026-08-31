import {
  isIsoDate,
  resolvePeriodFromSearch,
  todayEastern,
} from './financials/periods';
import { currentWeekRange } from './timesheet';

export const TIMESHEET_PERIOD_IDS = [
  'this_week',
  'this_month',
  'last_month',
  'trailing_3m',
  'ytd',
  'custom',
] as const;

export type TimesheetPeriodId = (typeof TIMESHEET_PERIOD_IDS)[number];

export interface TimesheetResolvedPeriod {
  id: TimesheetPeriodId;
  start: string;
  end: string;
  label: string;
}

export function timesheetPeriodOptions(): Array<{ id: TimesheetPeriodId; label: string }> {
  return [
    { id: 'this_week', label: 'This week' },
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'trailing_3m', label: 'Last 3 months' },
    { id: 'ytd', label: 'This year' },
    { id: 'custom', label: 'Custom dates' },
  ];
}

export function resolveTimesheetPeriod(
  searchParams: URLSearchParams,
  now = new Date(),
): TimesheetResolvedPeriod {
  const raw = String(searchParams.get('period') ?? 'this_week').trim() as TimesheetPeriodId;

  if (raw === 'this_week') {
    const week = currentWeekRange(now);
    return {
      id: 'this_week',
      start: week.start,
      end: week.end,
      label: 'This week',
    };
  }

  if (raw === 'custom') {
    const start = String(searchParams.get('start') ?? '').trim();
    const end = String(searchParams.get('end') ?? '').trim();
    if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
      const week = currentWeekRange(now);
      return {
        id: 'this_week',
        start: week.start,
        end: week.end,
        label: 'This week',
      };
    }
    return { id: 'custom', start, end, label: 'Custom range' };
  }

  if (raw === 'this_month' || raw === 'last_month' || raw === 'trailing_3m' || raw === 'ytd') {
    const resolved = resolvePeriodFromSearch(new URLSearchParams(`period=${raw}`), now);
    return {
      id: raw,
      start: resolved.start,
      end: resolved.end,
      label: resolved.label,
    };
  }

  const week = currentWeekRange(now);
  return {
    id: 'this_week',
    start: week.start,
    end: week.end,
    label: 'This week',
  };
}

export function isTimesheetPeriodId(value: string): value is TimesheetPeriodId {
  return (TIMESHEET_PERIOD_IDS as readonly string[]).includes(value);
}

export { todayEastern };
