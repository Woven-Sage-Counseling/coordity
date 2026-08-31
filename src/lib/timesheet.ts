import { todayEastern } from './financials/periods';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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
