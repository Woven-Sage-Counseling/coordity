import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import {
  addDays,
  currentWeekRange,
  formatHours,
  formatWorkDate,
  weekEndSunday,
  weekStartMonday,
} from './timesheet';

export interface TimesheetEntry {
  id: string;
  userId: string;
  workDate: string;
  minutes: number;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TimesheetWeekSummary {
  start: string;
  end: string;
  totalMinutes: number;
  entries: TimesheetEntry[];
}

type EntryRow = {
  id: string;
  user_id: string;
  work_date: string;
  minutes: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

function mapEntry(row: EntryRow): TimesheetEntry {
  return {
    id: row.id,
    userId: row.user_id,
    workDate: row.work_date,
    minutes: row.minutes,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ENTRY_SELECT = `
  SELECT id, user_id, work_date, minutes, notes, created_at, updated_at
  FROM timesheet_entry
`;

export function serializeTimesheetEntry(entry: TimesheetEntry) {
  return {
    id: entry.id,
    workDate: entry.workDate,
    dateLabel: formatWorkDate(entry.workDate),
    hoursLabel: formatHours(entry.minutes),
    minutes: entry.minutes,
    notes: entry.notes,
  };
}

export function serializeWeekSummary(summary: TimesheetWeekSummary) {
  return {
    start: summary.start,
    end: summary.end,
    totalMinutes: summary.totalMinutes,
    totalLabel: formatHours(summary.totalMinutes),
    entries: summary.entries.map(serializeTimesheetEntry),
  };
}

export async function listTimesheetEntriesForUser(
  userId: string,
  options: { start?: string; end?: string; limit?: number } = {},
): Promise<TimesheetEntry[]> {
  const { DB } = getEnv();
  const clauses = ['user_id = ?'];
  const binds: Array<string | number> = [userId];

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
    `${ENTRY_SELECT}
     WHERE ${clauses.join(' AND ')}
     ORDER BY work_date DESC
     LIMIT ?`,
  )
    .bind(...binds)
    .all<EntryRow>();

  return (rows.results ?? []).map(mapEntry);
}

export async function getWeekSummary(userId: string, weekStart?: string): Promise<TimesheetWeekSummary> {
  const start = weekStart ?? currentWeekRange().start;
  const end = weekEndSunday(start);
  const entries = await listTimesheetEntriesForUser(userId, { start, end });
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return {
    start,
    end,
    totalMinutes,
    entries: entries.sort((a, b) => a.workDate.localeCompare(b.workDate)),
  };
}

export async function upsertTimesheetEntry(input: {
  userId: string;
  workDate: string;
  minutes: number;
  notes: string | null;
}): Promise<TimesheetEntry> {
  const { DB } = getEnv();
  const now = nowMs();

  const existing = await DB.prepare(
    `SELECT id, created_at FROM timesheet_entry WHERE user_id = ? AND work_date = ?`,
  )
    .bind(input.userId, input.workDate)
    .first<{ id: string; created_at: number }>();

  const id = existing?.id ?? randomToken(16);
  const createdAt = existing?.created_at ?? now;

  await DB.prepare(
    `INSERT INTO timesheet_entry
       (id, user_id, work_date, minutes, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       minutes = excluded.minutes,
       notes = excluded.notes,
       updated_at = excluded.updated_at`,
  )
    .bind(id, input.userId, input.workDate, input.minutes, input.notes, createdAt, now)
    .run();

  const row = await DB.prepare(`${ENTRY_SELECT} WHERE id = ?`)
    .bind(id)
    .first<EntryRow>();
  if (!row) throw new Error('Unable to save that entry.');
  return mapEntry(row);
}

export async function deleteTimesheetEntry(entryId: string, userId: string): Promise<void> {
  const { DB } = getEnv();
  const result = await DB.prepare(`DELETE FROM timesheet_entry WHERE id = ? AND user_id = ?`)
    .bind(entryId, userId)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    throw new Error('Entry not found.');
  }
}

export function shiftWeek(start: string, weeks: number): string {
  return addDays(start, weeks * 7);
}

export { weekStartMonday };
