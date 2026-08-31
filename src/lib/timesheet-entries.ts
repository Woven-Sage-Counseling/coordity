import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import {
  currentWeekRange,
  easternDateFromMs,
  formatClockTime,
  formatHours,
  formatShiftRange,
  formatWorkDate,
  minutesBetween,
  weekEndSunday,
  weekStartMonday,
} from './timesheet';
import { listWorkItemsForShifts, serializeWorkItem, type TimesheetShiftWorkItem } from './timesheet-work-items';

export type TimesheetShiftSource = 'clock' | 'backlog';

export interface TimesheetShift {
  id: string;
  userId: string;
  workDate: string;
  startedAt: number | null;
  endedAt: number | null;
  minutes: number;
  notes: string | null;
  source: TimesheetShiftSource;
  backlogId: string | null;
  createdAt: number;
  updatedAt: number;
  workItems: TimesheetShiftWorkItem[];
}

export interface TimesheetWeekSummary {
  start: string;
  end: string;
  totalMinutes: number;
  entries: TimesheetShift[];
}

export interface TimesheetSummary {
  activeShift: TimesheetShift | null;
  week: TimesheetWeekSummary;
  weeklyAverageMinutes: number;
  entries: TimesheetShift[];
}

type ShiftRow = {
  id: string;
  user_id: string;
  work_date: string;
  started_at: number | null;
  ended_at: number | null;
  minutes: number;
  notes: string | null;
  source: TimesheetShiftSource;
  backlog_id: string | null;
  created_at: number;
  updated_at: number;
};

const SHIFT_SELECT = `
  SELECT id, user_id, work_date, started_at, ended_at, minutes, notes, source, backlog_id, created_at, updated_at
  FROM timesheet_shift
`;

function mapShift(row: ShiftRow, workItems: TimesheetShiftWorkItem[] = []): TimesheetShift {
  return {
    id: row.id,
    userId: row.user_id,
    workDate: row.work_date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    minutes: row.minutes,
    notes: row.notes,
    source: row.source,
    backlogId: row.backlog_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workItems,
  };
}

export function serializeTimesheetShift(shift: TimesheetShift) {
  const isActive = shift.source === 'clock' && shift.endedAt == null;
  const workItems = shift.workItems.map(serializeWorkItem);
  const allocatedMinutes = workItems.reduce((sum, item) => sum + item.minutes, 0);
  return {
    id: shift.id,
    workDate: shift.workDate,
    dateLabel: formatWorkDate(shift.workDate),
    hoursLabel: formatHours(shift.minutes),
    minutes: shift.minutes,
    notes: shift.notes,
    source: shift.source,
    isActive,
    canEditWorkItems: !isActive,
    workItems,
    allocatedMinutes,
    unallocatedMinutes: Math.max(0, shift.minutes - allocatedMinutes),
    unallocatedLabel: formatHours(Math.max(0, shift.minutes - allocatedMinutes)),
    timeLabel:
      shift.source === 'backlog'
        ? shift.startedAt != null && shift.endedAt != null
          ? formatShiftRange(shift.startedAt, shift.endedAt)
          : 'Backlog entry'
        : isActive && shift.startedAt != null
          ? `Started ${formatClockTime(shift.startedAt)}`
          : formatShiftRange(shift.startedAt, shift.endedAt),
    startedAt: shift.startedAt,
    endedAt: shift.endedAt,
  };
}

export function serializeWeekSummary(summary: TimesheetWeekSummary) {
  return {
    start: summary.start,
    end: summary.end,
    totalMinutes: summary.totalMinutes,
    totalLabel: formatHours(summary.totalMinutes),
    entries: summary.entries.map(serializeTimesheetShift),
  };
}

export function serializeTimesheetSummary(summary: TimesheetSummary) {
  return {
    activeShift: summary.activeShift ? serializeTimesheetShift(summary.activeShift) : null,
    week: serializeWeekSummary(summary.week),
    weeklyAverageMinutes: summary.weeklyAverageMinutes,
    weeklyAverageLabel: formatHours(summary.weeklyAverageMinutes),
    entries: summary.entries.map(serializeTimesheetShift),
  };
}

export async function getActiveShift(userId: string): Promise<TimesheetShift | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `${SHIFT_SELECT}
     WHERE user_id = ? AND source = 'clock' AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
  )
    .bind(userId)
    .first<ShiftRow>();

  return row ? mapShift(row) : null;
}

export async function listTimesheetShiftsForUser(
  userId: string,
  options: { start?: string; end?: string; limit?: number; completedOnly?: boolean } = {},
): Promise<TimesheetShift[]> {
  const { DB } = getEnv();
  const clauses = ['user_id = ?'];
  const binds: Array<string | number> = [userId];

  if (options.completedOnly) {
    clauses.push('ended_at IS NOT NULL');
  }
  if (options.start) {
    clauses.push('work_date >= ?');
    binds.push(options.start);
  }
  if (options.end) {
    clauses.push('work_date <= ?');
    binds.push(options.end);
  }

  const limit = options.limit ?? 100;
  binds.push(limit);

  const rows = await DB.prepare(
    `${SHIFT_SELECT}
     WHERE ${clauses.join(' AND ')}
     ORDER BY COALESCE(ended_at, started_at, created_at) DESC
     LIMIT ?`,
  )
    .bind(...binds)
    .all<ShiftRow>();

  return (rows.results ?? []).map((row) => mapShift(row));
}

async function attachWorkItems(shifts: TimesheetShift[]): Promise<TimesheetShift[]> {
  if (shifts.length === 0) return shifts;
  const workItemsByShift = await listWorkItemsForShifts(shifts.map((shift) => shift.id));
  return shifts.map((shift) => mapShift(
    {
      id: shift.id,
      user_id: shift.userId,
      work_date: shift.workDate,
      started_at: shift.startedAt,
      ended_at: shift.endedAt,
      minutes: shift.minutes,
      notes: shift.notes,
      source: shift.source,
      backlog_id: shift.backlogId,
      created_at: shift.createdAt,
      updated_at: shift.updatedAt,
    },
    workItemsByShift.get(shift.id) ?? [],
  ));
}

export async function getWeekSummary(userId: string, weekStart?: string): Promise<TimesheetWeekSummary> {
  const start = weekStart ?? currentWeekRange().start;
  const end = weekEndSunday(start);
  const entries = await listTimesheetShiftsForUser(userId, { start, end, completedOnly: true });
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return {
    start,
    end,
    totalMinutes,
    entries: entries.sort((a, b) => {
      const aKey = a.endedAt ?? a.startedAt ?? a.createdAt;
      const bKey = b.endedAt ?? b.startedAt ?? b.createdAt;
      return aKey - bKey;
    }),
  };
}

export async function getWeeklyAverageMinutes(userId: string): Promise<number> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT work_date, minutes
     FROM timesheet_shift
     WHERE user_id = ? AND ended_at IS NOT NULL`,
  )
    .bind(userId)
    .all<{ work_date: string; minutes: number }>();

  const byWeek = new Map<string, number>();
  for (const row of rows.results ?? []) {
    const weekStart = weekStartMonday(row.work_date);
    byWeek.set(weekStart, (byWeek.get(weekStart) ?? 0) + row.minutes);
  }

  if (byWeek.size === 0) return 0;
  const total = [...byWeek.values()].reduce((sum, minutes) => sum + minutes, 0);
  return Math.round(total / byWeek.size);
}

export async function getTimesheetSummary(userId: string): Promise<TimesheetSummary> {
  const [activeShiftRaw, weekRaw, weeklyAverageMinutes, entriesRaw] = await Promise.all([
    getActiveShift(userId),
    getWeekSummary(userId),
    getWeeklyAverageMinutes(userId),
    listTimesheetShiftsForUser(userId, { limit: 100 }),
  ]);

  const unique = new Map<string, TimesheetShift>();
  if (activeShiftRaw) unique.set(activeShiftRaw.id, activeShiftRaw);
  for (const entry of entriesRaw) unique.set(entry.id, entry);
  for (const entry of weekRaw.entries) unique.set(entry.id, entry);

  const withItems = await attachWorkItems([...unique.values()]);
  const byId = new Map(withItems.map((shift) => [shift.id, shift]));

  const weekEntries = weekRaw.entries
    .map((entry) => byId.get(entry.id) ?? entry)
    .sort((a, b) => {
      const aKey = a.endedAt ?? a.startedAt ?? a.createdAt;
      const bKey = b.endedAt ?? b.startedAt ?? b.createdAt;
      return aKey - bKey;
    });

  return {
    activeShift: activeShiftRaw ? byId.get(activeShiftRaw.id) ?? activeShiftRaw : null,
    week: {
      ...weekRaw,
      entries: weekEntries,
    },
    weeklyAverageMinutes,
    entries: entriesRaw.map((entry) => byId.get(entry.id) ?? entry),
  };
}

export async function startShift(userId: string): Promise<TimesheetShift> {
  const active = await getActiveShift(userId);
  if (active) {
    throw new Error('You already have an active shift. End it before starting another.');
  }

  const { DB } = getEnv();
  const now = nowMs();
  const workDate = easternDateFromMs(now);
  const id = randomToken(16);

  await DB.prepare(
    `INSERT INTO timesheet_shift
       (id, user_id, work_date, started_at, ended_at, minutes, notes, source, backlog_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 0, NULL, 'clock', NULL, ?, ?)`,
  )
    .bind(id, userId, workDate, now, now, now)
    .run();

  const row = await DB.prepare(`${SHIFT_SELECT} WHERE id = ?`).bind(id).first<ShiftRow>();
  if (!row) throw new Error('Unable to start your shift.');
  return mapShift(row);
}

export async function endShift(userId: string): Promise<TimesheetShift> {
  const active = await getActiveShift(userId);
  if (!active || active.startedAt == null) {
    throw new Error('No active shift to end.');
  }

  const { DB } = getEnv();
  const endedAt = nowMs();
  const minutes = minutesBetween(active.startedAt, endedAt);
  const workDate = easternDateFromMs(active.startedAt);

  await DB.prepare(
    `UPDATE timesheet_shift
     SET ended_at = ?, minutes = ?, work_date = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND ended_at IS NULL`,
  )
    .bind(endedAt, minutes, workDate, endedAt, active.id, userId)
    .run();

  const row = await DB.prepare(`${SHIFT_SELECT} WHERE id = ?`).bind(active.id).first<ShiftRow>();
  if (!row) throw new Error('Unable to end your shift.');
  return mapShift(row);
}

export async function createBacklogShift(input: {
  userId: string;
  workDate: string;
  minutes: number;
  notes: string | null;
  backlogId: string;
  startedAt?: number | null;
  endedAt?: number | null;
}): Promise<TimesheetShift> {
  const { DB } = getEnv();
  const now = nowMs();
  const id = randomToken(16);
  const startedAt = input.startedAt ?? null;
  const endedAt = input.endedAt ?? null;

  await DB.prepare(
    `INSERT INTO timesheet_shift
       (id, user_id, work_date, started_at, ended_at, minutes, notes, source, backlog_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'backlog', ?, ?, ?)`,
  )
    .bind(
      id,
      input.userId,
      input.workDate,
      startedAt,
      endedAt,
      input.minutes,
      input.notes,
      input.backlogId,
      now,
      now,
    )
    .run();

  const row = await DB.prepare(`${SHIFT_SELECT} WHERE id = ?`).bind(id).first<ShiftRow>();
  if (!row) throw new Error('Unable to save approved backlog hours.');
  return mapShift(row);
}

export { parseBacklogTimeRange } from './timesheet';

export function shiftWeek(start: string, weeks: number): string {
  return addDays(start, weeks * 7);
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export { weekStartMonday } from './timesheet';