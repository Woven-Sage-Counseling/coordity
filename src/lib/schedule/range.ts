import { todayEastern } from '../financials/periods';
import type { ResolvedScheduleRange, ScheduleRangeId } from './types';

const TZ = 'America/New_York';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function addDays(iso: string, days: number): string {
  const parsed = parseIso(iso);
  if (!parsed) return iso;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const date = new Date(utc);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function easternParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function easternInstant(isoDate: string, hour: number, minute: number, second: number): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  let utcMs = Date.UTC(year, month - 1, day, hour + 5, minute, second);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = easternParts(new Date(utcMs));
    const deltaHours = hour - parts.hour;
    const deltaMinutes = minute - parts.minute;
    const deltaSeconds = second - parts.second;
    const deltaDays = day - parts.day;
    const deltaMs = ((deltaDays * 24 + deltaHours) * 3600 + deltaMinutes * 60 + deltaSeconds) * 1000;
    if (Math.abs(deltaMs) < 1000) break;
    utcMs += deltaMs;
  }
  return utcMs;
}

function easternWeekdayIndex(isoDate: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(new Date(easternInstant(isoDate, 12, 0, 0)));
  return WEEKDAY[weekday] ?? 0;
}

function toRfc3339(ms: number): string {
  return new Date(ms).toISOString();
}

function boundsForRange(start: string, end: string): { timeMin: string; timeMax: string } {
  const timeMin = toRfc3339(easternInstant(start, 0, 0, 0));
  const endExclusive = addDays(end, 1);
  const timeMax = toRfc3339(easternInstant(endExclusive, 0, 0, 0));
  return { timeMin, timeMax };
}

export function isScheduleRangeId(value: string): value is ScheduleRangeId {
  return value === 'today' || value === 'this_week' || value === 'next_7_days' || value === 'next_14_days';
}

export function resolveScheduleRange(id: ScheduleRangeId, now = new Date()): ResolvedScheduleRange {
  const today = todayEastern(now);

  if (id === 'today') {
    const bounds = boundsForRange(today, today);
    return { id, start: today, end: today, label: 'Today', ...bounds };
  }

  if (id === 'this_week') {
    const weekday = easternWeekdayIndex(today);
    const start = addDays(today, -weekday);
    const end = addDays(start, 6);
    const bounds = boundsForRange(start, end);
    return { id, start, end, label: 'This week', ...bounds };
  }

  if (id === 'next_7_days') {
    const end = addDays(today, 6);
    const bounds = boundsForRange(today, end);
    return { id, start: today, end, label: 'Next 7 days', ...bounds };
  }

  const end = addDays(today, 13);
  const bounds = boundsForRange(today, end);
  return { id, start: today, end, label: 'Next 14 days', ...bounds };
}

export function formatScheduleEventTime(event: { start: string; end: string; allDay: boolean }): string {
  if (event.allDay) return 'All day';

  const startMs = Date.parse(event.start);
  const endMs = Date.parse(event.end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return '';

  const timeOptions: Intl.DateTimeFormatOptions = {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  };
  const startLabel = new Date(startMs).toLocaleTimeString('en-US', timeOptions);
  const endLabel = new Date(endMs).toLocaleTimeString('en-US', timeOptions);
  return `${startLabel} – ${endLabel}`;
}

export function formatScheduleEventDay(isoOrDateTime: string): string {
  const ms = Date.parse(isoOrDateTime.includes('T') ? isoOrDateTime : `${isoOrDateTime}T12:00:00`);
  if (Number.isNaN(ms)) return isoOrDateTime;
  return new Date(ms).toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function groupEventsByDay<T extends { start: string; allDay: boolean }>(
  events: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const dayKey = event.allDay
      ? event.start.slice(0, 10)
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: TZ,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(event.start));
    const bucket = groups.get(dayKey) ?? [];
    bucket.push(event);
    groups.set(dayKey, bucket);
  }
  return groups;
}

export function eachDayInRange(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  for (let i = 0; i < 32; i += 1) {
    days.push(cursor);
    if (cursor === end) break;
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function easternMinutesFromMidnight(isoOrDateTime: string): number {
  if (!isoOrDateTime.includes('T')) return 0;
  const parts = easternParts(new Date(isoOrDateTime));
  return parts.hour * 60 + parts.minute;
}

export function formatWeekdayShort(isoDate: string): string {
  return new Date(easternInstant(isoDate, 12, 0, 0)).toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
  });
}

export function formatDayNumber(isoDate: string): string {
  return new Date(easternInstant(isoDate, 12, 0, 0)).toLocaleDateString('en-US', {
    timeZone: TZ,
    day: 'numeric',
  });
}
