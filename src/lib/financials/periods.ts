export const PERIOD_IDS = ['ytd', 'this_month', 'last_month', 'trailing_3m', 'last_year', 'custom'] as const;

export type PeriodId = (typeof PERIOD_IDS)[number];

export interface ResolvedPeriod {
  id: PeriodId;
  start: string;
  end: string;
  label: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayEastern(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function parseIso(value: string): { year: number; month: number; day: number } | null {
  if (!ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth(year, month)) return null;
  return { year, month, day };
}

export function isIsoDate(value: string): boolean {
  return parseIso(value) != null;
}

function daysInclusive(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function resolvePreset(id: Exclude<PeriodId, 'custom'>, now = new Date()): ResolvedPeriod {
  const today = todayEastern(now);
  const { year, month } = parseIso(today)!;

  if (id === 'ytd') {
    return { id, start: toIso(year, 1, 1), end: today, label: 'This year' };
  }

  if (id === 'this_month') {
    return { id, start: toIso(year, month, 1), end: today, label: 'This month' };
  }

  if (id === 'last_month') {
    const previous = shiftMonth(year, month, -1);
    return {
      id,
      start: toIso(previous.year, previous.month, 1),
      end: toIso(previous.year, previous.month, lastDayOfMonth(previous.year, previous.month)),
      label: 'Last month',
    };
  }

  if (id === 'trailing_3m') {
    const startMonth = shiftMonth(year, month, -2);
    return {
      id,
      start: toIso(startMonth.year, startMonth.month, 1),
      end: today,
      label: 'Last 3 months',
    };
  }

  return {
    id: 'last_year',
    start: toIso(year - 1, 1, 1),
    end: toIso(year - 1, 12, 31),
    label: 'Last year',
  };
}

export function periodOptions(now = new Date()): ResolvedPeriod[] {
  return (['ytd', 'this_month', 'last_month', 'trailing_3m', 'last_year'] as const).map((id) =>
    resolvePreset(id, now),
  );
}

export function resolveCustomPeriod(start: string, end: string, today = todayEastern()): ResolvedPeriod | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return null;
  if (start > end || end > today || start < '2018-01-01') return null;
  if (daysInclusive(start, end) > 366 * 3) return null;
  return { id: 'custom', start, end, label: 'Custom' };
}

export function resolvePeriodFromSearch(search?: URLSearchParams | null, now = new Date()): ResolvedPeriod {
  const today = todayEastern(now);
  const requested = search?.get('period');
  const custom = resolveCustomPeriod(search?.get('start') ?? '', search?.get('end') ?? '', today);

  if (requested === 'custom' && custom) return custom;
  if (requested && (PERIOD_IDS as readonly string[]).includes(requested) && requested !== 'custom') {
    return resolvePreset(requested as Exclude<PeriodId, 'custom'>, now);
  }
  if (custom) return custom;
  return resolvePreset('ytd', now);
}

export function periodQuery(period: ResolvedPeriod): string {
  const params = new URLSearchParams({ period: period.id });
  if (period.id === 'custom') {
    params.set('start', period.start);
    params.set('end', period.end);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
