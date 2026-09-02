import { todayEastern } from './financials/periods';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
export const MAX_MINUTES_PER_DAY = 24 * 60;

export function weekStartMonday(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utc.getUTCDay();
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function weekEndSunday(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function currentWeekRange(now = new Date()): { start: string; end: string } {
  const today = todayEastern(now);
  const start = weekStartMonday(today);
  return { start, end: weekEndSunday(start) };
}

export function formatWeekLabel(start: string, end: string): string {
  const startLabel = formatWorkDate(start, { weekday: false });
  const endLabel = formatWorkDate(end, { weekday: false });
  return `${startLabel} – ${endLabel}`;
}

export function formatWorkDate(
  date: string,
  options: { weekday?: boolean } = { weekday: true },
): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: options.weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

export function formatHours(minutes: number): string {
  if (minutes <= 0) return '0 hrs';
  const hours = minutes / 60;
  if (minutes % 60 === 0) return `${hours} hrs`;
  return `${hours.toFixed(1)} hrs`;
}

export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const CLOCK_MINUTE_OPTIONS = [0, 15, 30, 45] as const;

export function easternClockParts(ms: number): {
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(ms));

  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 12);
  const rawMinute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value ?? 'AM';
  const minute = CLOCK_MINUTE_OPTIONS.reduce((closest, candidate) =>
    Math.abs(candidate - rawMinute) < Math.abs(closest - rawMinute) ? candidate : closest,
  );
  const period = dayPeriod.toUpperCase() === 'PM' ? 'PM' : 'AM';

  return { hour, minute, period };
}

export function easternDateFromMs(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
}

export function formatShiftRange(startedAt: number | null, endedAt: number | null): string {
  if (startedAt == null || endedAt == null) return 'Manual entry';
  return `${formatClockTime(startedAt)} – ${formatClockTime(endedAt)}`;
}

export function minutesBetween(startedAt: number, endedAt: number): number {
  const minutes = Math.round((endedAt - startedAt) / 60_000);
  if (minutes < 1) return 1;
  if (minutes > MAX_MINUTES_PER_DAY) {
    throw new Error('A single shift cannot be longer than 24 hours.');
  }
  return minutes;
}

export function parseTimeInput(raw: string): { hours: number; minutes: number } {
  const match = ISO_TIME.exec(raw.trim());
  if (!match) {
    throw new Error('Enter a valid start and end time.');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error('Enter a valid start and end time.');
  }

  return { hours, minutes };
}

export function easternDateTimeToMs(workDate: string, time: string): number {
  if (!ISO_DATE.test(workDate)) {
    throw new Error('Choose a valid date.');
  }

  const { hours, minutes } = parseTimeInput(time);
  const [year, month, day] = workDate.split('-').map(Number);
  let timestamp = Date.UTC(year, month - 1, day, hours + 5, minutes);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(timestamp));

    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
    const easternYear = part('year');
    const easternMonth = part('month');
    const easternDay = part('day');
    const easternHour = part('hour') % 24;
    const easternMinute = part('minute');

    if (
      easternYear === year &&
      easternMonth === month &&
      easternDay === day &&
      easternHour === hours &&
      easternMinute === minutes
    ) {
      return timestamp;
    }

    const targetDay = Date.UTC(year, month - 1, day);
    const actualDay = Date.UTC(easternYear, easternMonth - 1, easternDay);
    const dayDiff = Math.round((targetDay - actualDay) / 86_400_000);
    const minuteDiff = hours * 60 + minutes - (easternHour * 60 + easternMinute) + dayDiff * 24 * 60;
    timestamp += minuteDiff * 60_000;
  }

  throw new Error('Enter a valid start and end time.');
}

export function parseBacklogTimeRange(form: FormData): {
  workDate: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  notes: string | null;
} {
  const workDate = String(form.get('workDate') ?? '').trim();
  if (!ISO_DATE.test(workDate)) {
    throw new Error('Choose a valid date.');
  }

  const timeStarted = String(form.get('timeStarted') ?? '').trim();
  const timeEnded = String(form.get('timeEnded') ?? '').trim();
  if (!timeStarted || !timeEnded) {
    throw new Error('Enter both a start time and an end time.');
  }

  const startedAt = easternDateTimeToMs(workDate, timeStarted);
  let endedAt = easternDateTimeToMs(workDate, timeEnded);
  if (endedAt <= startedAt) {
    endedAt = easternDateTimeToMs(addDays(workDate, 1), timeEnded);
  }

  const minutes = minutesBetween(startedAt, endedAt);
  const notes = String(form.get('notes') ?? '').trim();

  return {
    workDate,
    startedAt,
    endedAt,
    minutes,
    notes: notes || null,
  };
}

export function parseHoursInput(raw: string): number {
  const value = raw.trim().replace(',', '.');
  if (!value) {
    throw new Error('Enter the hours worked.');
  }

  if (value.includes(':')) {
    const [hourPart, minutePart] = value.split(':');
    const hours = Number(hourPart);
    const mins = Number(minutePart);
    if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || mins < 0 || mins >= 60) {
      throw new Error('Use hours like 7.5 or a time like 7:30.');
    }
    const total = Math.round(hours * 60 + mins);
    if (total <= 0 || total > MAX_MINUTES_PER_DAY) {
      throw new Error('Hours must be between 0 and 24 per day.');
    }
    return total;
  }

  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error('Hours must be between 0 and 24 per day.');
  }

  return Math.round(hours * 60);
}

export function parseTimesheetForm(form: FormData): {
  workDate: string;
  minutes: number;
  notes: string | null;
} {
  const workDate = String(form.get('workDate') ?? todayEastern()).trim();
  if (!ISO_DATE.test(workDate)) {
    throw new Error('Choose a valid date.');
  }

  const minutes = parseHoursInput(String(form.get('hours') ?? ''));
  const notes = String(form.get('notes') ?? '').trim();

  return {
    workDate,
    minutes,
    notes: notes || null,
  };
}
