import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { formatClockTime, formatHours, minutesBetween } from './timesheet';

export interface TimesheetShiftBreak {
  id: string;
  shiftId: string;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
}

type BreakRow = {
  id: string;
  shift_id: string;
  started_at: number;
  ended_at: number | null;
  created_at: number;
};

function mapBreak(row: BreakRow): TimesheetShiftBreak {
  return {
    id: row.id,
    shiftId: row.shift_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export async function listBreaksForShifts(
  shiftIds: string[],
): Promise<Map<string, TimesheetShiftBreak[]>> {
  const map = new Map<string, TimesheetShiftBreak[]>();
  if (shiftIds.length === 0) return map;

  const { DB } = getEnv();
  const placeholders = shiftIds.map(() => '?').join(', ');
  const rows = await DB.prepare(
    `SELECT id, shift_id, started_at, ended_at, created_at
     FROM timesheet_shift_break
     WHERE shift_id IN (${placeholders})
     ORDER BY started_at ASC`,
  )
    .bind(...shiftIds)
    .all<BreakRow>();

  for (const row of rows.results ?? []) {
    const list = map.get(row.shift_id) ?? [];
    list.push(mapBreak(row));
    map.set(row.shift_id, list);
  }
  return map;
}

export function isOnBreak(breaks: TimesheetShiftBreak[]): boolean {
  return breaks.some((item) => item.endedAt == null);
}

export function pauseMinutesForBreaks(
  breaks: TimesheetShiftBreak[],
  untilMs = nowMs(),
): number {
  let total = 0;
  for (const item of breaks) {
    const end = item.endedAt ?? untilMs;
    if (end <= item.startedAt) continue;
    total += Math.max(0, Math.round((end - item.startedAt) / 60_000));
  }
  return total;
}

/** Gross wall minutes minus pauses (never negative). */
export function paidMinutesForShift(input: {
  startedAt: number;
  endedAt: number;
  breaks: TimesheetShiftBreak[];
}): number {
  const gross = minutesBetween(input.startedAt, input.endedAt);
  const paused = pauseMinutesForBreaks(input.breaks, input.endedAt);
  return Math.max(0, gross - paused);
}

export function formatPauseIntervals(breaks: TimesheetShiftBreak[]): string | null {
  const closed = breaks.filter((item) => item.endedAt != null);
  if (closed.length === 0) return null;
  const parts = closed.map((item) => {
    const mins = Math.max(0, Math.round(((item.endedAt ?? item.startedAt) - item.startedAt) / 60_000));
    return `${formatClockTime(item.startedAt)}–${formatClockTime(item.endedAt!)}${mins > 0 ? ` (${formatHours(mins).replace(' hrs', 'h')})` : ''}`;
  });
  return `Paused ${parts.join(' · ')}`;
}

export function serializeBreak(item: TimesheetShiftBreak) {
  const endedAt = item.endedAt;
  const minutes =
    endedAt != null ? Math.max(0, Math.round((endedAt - item.startedAt) / 60_000)) : null;
  return {
    id: item.id,
    startedAt: item.startedAt,
    endedAt,
    minutes,
    label:
      endedAt != null
        ? `${formatClockTime(item.startedAt)}–${formatClockTime(endedAt)}`
        : `Since ${formatClockTime(item.startedAt)}`,
  };
}

export async function getOpenBreak(shiftId: string): Promise<TimesheetShiftBreak | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, shift_id, started_at, ended_at, created_at
     FROM timesheet_shift_break
     WHERE shift_id = ? AND ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
  )
    .bind(shiftId)
    .first<BreakRow>();
  return row ? mapBreak(row) : null;
}

export async function pauseShift(shiftId: string, userId: string): Promise<TimesheetShiftBreak> {
  const { DB } = getEnv();
  const shift = await DB.prepare(
    `SELECT id, user_id, ended_at FROM timesheet_shift WHERE id = ? AND user_id = ? AND source = 'clock'`,
  )
    .bind(shiftId, userId)
    .first<{ id: string; user_id: string; ended_at: number | null }>();

  if (!shift || shift.ended_at != null) {
    throw new Error('No active shift to pause.');
  }

  const open = await getOpenBreak(shiftId);
  if (open) throw new Error('This shift is already paused.');

  const id = randomToken(16);
  const now = nowMs();
  await DB.prepare(
    `INSERT INTO timesheet_shift_break (id, shift_id, started_at, ended_at, created_at)
     VALUES (?, ?, ?, NULL, ?)`,
  )
    .bind(id, shiftId, now, now)
    .run();

  await DB.prepare(`UPDATE timesheet_shift SET updated_at = ? WHERE id = ?`).bind(now, shiftId).run();

  const row = await DB.prepare(
    `SELECT id, shift_id, started_at, ended_at, created_at FROM timesheet_shift_break WHERE id = ?`,
  )
    .bind(id)
    .first<BreakRow>();
  if (!row) throw new Error('Could not pause shift.');
  return mapBreak(row);
}

export async function resumeShift(shiftId: string, userId: string): Promise<TimesheetShiftBreak> {
  const { DB } = getEnv();
  const shift = await DB.prepare(
    `SELECT id, user_id, ended_at FROM timesheet_shift WHERE id = ? AND user_id = ? AND source = 'clock'`,
  )
    .bind(shiftId, userId)
    .first<{ id: string; user_id: string; ended_at: number | null }>();

  if (!shift || shift.ended_at != null) {
    throw new Error('No active shift to resume.');
  }

  const open = await getOpenBreak(shiftId);
  if (!open) throw new Error('This shift is not paused.');

  const now = nowMs();
  await DB.prepare(`UPDATE timesheet_shift_break SET ended_at = ? WHERE id = ?`)
    .bind(now, open.id)
    .run();
  await DB.prepare(`UPDATE timesheet_shift SET updated_at = ? WHERE id = ?`).bind(now, shiftId).run();

  return { ...open, endedAt: now };
}

export async function closeOpenBreak(shiftId: string, endedAt: number): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE timesheet_shift_break
     SET ended_at = ?
     WHERE shift_id = ? AND ended_at IS NULL`,
  )
    .bind(endedAt, shiftId)
    .run();
}
