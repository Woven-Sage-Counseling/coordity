import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';
import { todayEastern } from './financials/periods';
import type { TimeOffEntry } from './time-off';

export type TimeOffRequestStatus = 'pending' | 'approved' | 'denied';

export interface StoredTimeOffEntry {
  id: string;
  date: string;
  fullDay: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface TimeOffRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: TimeOffRequestStatus;
  notes: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  createdAt: number;
  entries: StoredTimeOffEntry[];
}

type RequestRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: TimeOffRequestStatus;
  notes: string | null;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: number | null;
  created_at: number;
};

type EntryRow = {
  id: string;
  request_id: string;
  entry_date: string;
  full_day: number;
  start_time: string | null;
  end_time: string | null;
};

export async function createTimeOffRequest(
  userId: string,
  entries: TimeOffEntry[],
  notes: string,
): Promise<{ id: string; createdAt: number }> {
  const { DB } = getEnv();
  const requestId = randomToken(16);
  const ts = nowMs();

  await DB.prepare(
    `INSERT INTO time_off_request (id, user_id, status, notes, created_at)
     VALUES (?, ?, 'pending', ?, ?)`,
  )
    .bind(requestId, userId, notes.trim() || null, ts)
    .run();

  for (const entry of entries) {
    await DB.prepare(
      `INSERT INTO time_off_entry (id, request_id, entry_date, full_day, start_time, end_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        randomToken(16),
        requestId,
        entry.date,
        entry.fullDay ? 1 : 0,
        entry.fullDay ? null : entry.startTime,
        entry.fullDay ? null : entry.endTime,
      )
      .run();
  }

  return { id: requestId, createdAt: ts };
}

export async function listTimeOffRequestsForUser(userId: string, limit = 50): Promise<TimeOffRequest[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        u.email AS user_email,
        r.status,
        r.notes,
        r.reviewed_by,
        reviewer.name AS reviewer_name,
        r.reviewed_at,
        r.created_at
     FROM time_off_request r
     JOIN user u ON u.id = r.user_id
     LEFT JOIN user reviewer ON reviewer.id = r.reviewed_by
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<RequestRow>();

  return attachEntries(rows.results ?? []);
}

export async function listTimeOffRequestsForAdmin(limit = 100): Promise<TimeOffRequest[]> {
  const { DB } = getEnv();
  const today = todayEastern();
  const rows = await DB.prepare(
    `SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        u.email AS user_email,
        r.status,
        r.notes,
        r.reviewed_by,
        reviewer.name AS reviewer_name,
        r.reviewed_at,
        r.created_at
     FROM time_off_request r
     JOIN user u ON u.id = r.user_id
     LEFT JOIN user reviewer ON reviewer.id = r.reviewed_by
     WHERE r.status = 'pending'
        OR (
          r.status = 'approved'
          AND (
            SELECT MAX(e.entry_date)
            FROM time_off_entry e
            WHERE e.request_id = r.id
          ) >= ?
        )
     ORDER BY
       CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
       r.created_at DESC
     LIMIT ?`,
  )
    .bind(today, limit)
    .all<RequestRow>();

  return attachEntries(rows.results ?? []);
}

export async function retractTimeOffRequest(requestId: string, userId: string): Promise<TimeOffRequest> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        u.email AS user_email,
        r.status,
        r.notes,
        r.reviewed_by,
        reviewer.name AS reviewer_name,
        r.reviewed_at,
        r.created_at
     FROM time_off_request r
     JOIN user u ON u.id = r.user_id
     LEFT JOIN user reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ? AND r.user_id = ?`,
  )
    .bind(requestId, userId)
    .all<RequestRow>();

  const [request] = await attachEntries(rows.results ?? []);
  if (!request) {
    throw new Error('That request was not found.');
  }
  if (request.status !== 'pending') {
    throw new Error('Only pending requests can be retracted.');
  }

  const result = await DB.prepare(
    `DELETE FROM time_off_request WHERE id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(requestId, userId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new Error('Could not retract that request.');
  }

  return request;
}

export async function reviewTimeOffRequest(
  requestId: string,
  reviewerId: string,
  status: 'approved' | 'denied',
): Promise<TimeOffRequest> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        r.id,
        r.user_id,
        u.name AS user_name,
        u.email AS user_email,
        r.status,
        r.notes,
        r.reviewed_by,
        reviewer.name AS reviewer_name,
        r.reviewed_at,
        r.created_at
     FROM time_off_request r
     JOIN user u ON u.id = r.user_id
     LEFT JOIN user reviewer ON reviewer.id = r.reviewed_by
     WHERE r.id = ?`,
  )
    .bind(requestId)
    .all<RequestRow>();

  const [existing] = await attachEntries(rows.results ?? []);
  if (!existing) {
    throw new Error('That time off request was not found.');
  }
  if (existing.status !== 'pending') {
    throw new Error('That request has already been reviewed.');
  }

  const reviewedAt = nowMs();
  const result = await DB.prepare(
    `UPDATE time_off_request
     SET status = ?, reviewed_by = ?, reviewed_at = ?
     WHERE id = ? AND status = 'pending'`,
  )
    .bind(status, reviewerId, reviewedAt, requestId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new Error('Could not update that request.');
  }

  const reviewer = await DB.prepare(`SELECT name FROM user WHERE id = ?`)
    .bind(reviewerId)
    .first<{ name: string }>();

  return {
    ...existing,
    status,
    reviewedBy: reviewerId,
    reviewerName: reviewer?.name ?? null,
    reviewedAt,
  };
}

export async function deleteDeniedTimeOffRequest(requestId: string, userId: string): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT id, status FROM time_off_request WHERE id = ? AND user_id = ?`,
  )
    .bind(requestId, userId)
    .first<{ id: string; status: TimeOffRequestStatus }>();

  if (!existing) {
    throw new Error('That request was not found.');
  }
  if (existing.status !== 'denied') {
    throw new Error('Only denied requests can be deleted.');
  }

  const result = await DB.prepare(
    `DELETE FROM time_off_request WHERE id = ? AND user_id = ? AND status = 'denied'`,
  )
    .bind(requestId, userId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new Error('Could not delete that request.');
  }
}

async function attachEntries(rows: RequestRow[]): Promise<TimeOffRequest[]> {
  if (rows.length === 0) return [];

  const { DB } = getEnv();
  const placeholders = rows.map(() => '?').join(', ');
  const entryRows = await DB.prepare(
    `SELECT id, request_id, entry_date, full_day, start_time, end_time
     FROM time_off_entry
     WHERE request_id IN (${placeholders})
     ORDER BY entry_date ASC, start_time ASC`,
  )
    .bind(...rows.map((row) => row.id))
    .all<EntryRow>();

  const entriesByRequest = new Map<string, StoredTimeOffEntry[]>();
  for (const row of entryRows.results ?? []) {
    const bucket = entriesByRequest.get(row.request_id) ?? [];
    bucket.push({
      id: row.id,
      date: row.entry_date,
      fullDay: row.full_day === 1,
      startTime: row.start_time,
      endTime: row.end_time,
    });
    entriesByRequest.set(row.request_id, bucket);
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    status: row.status,
    notes: row.notes,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    entries: entriesByRequest.get(row.id) ?? [],
  }));
}

export function timeOffStatusLabel(status: TimeOffRequestStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Denied';
  return 'Pending';
}

export function formatTimeOffRequestDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EASTERN_TZ = 'America/New_York';

export function easternClockTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function isTimeOffEntryActiveNow(
  entry: Pick<StoredTimeOffEntry, 'date' | 'fullDay' | 'startTime' | 'endTime'>,
  today: string,
  clockTime: string,
): boolean {
  if (entry.date !== today) return false;
  if (entry.fullDay) return true;
  if (!entry.startTime || !entry.endTime) return false;
  return clockTime >= entry.startTime && clockTime < entry.endTime;
}

export async function listUsersOnApprovedTimeOffNow(now = new Date()): Promise<Set<string>> {
  const { DB } = getEnv();
  const today = todayEastern(now);
  const clockTime = easternClockTime(now);
  const rows = await DB.prepare(
    `SELECT r.user_id, e.entry_date, e.full_day, e.start_time, e.end_time
     FROM time_off_request r
     JOIN time_off_entry e ON e.request_id = r.id
     WHERE r.status = 'approved' AND e.entry_date = ?`,
  )
    .bind(today)
    .all<{
      user_id: string;
      entry_date: string;
      full_day: number;
      start_time: string | null;
      end_time: string | null;
    }>();

  const userIds = new Set<string>();
  for (const row of rows.results ?? []) {
    if (
      isTimeOffEntryActiveNow(
        {
          date: row.entry_date,
          fullDay: row.full_day === 1,
          startTime: row.start_time,
          endTime: row.end_time,
        },
        today,
        clockTime,
      )
    ) {
      userIds.add(row.user_id);
    }
  }
  return userIds;
}

export async function isUserOnApprovedTimeOffNow(userId: string, now = new Date()): Promise<boolean> {
  const { DB } = getEnv();
  const today = todayEastern(now);
  const clockTime = easternClockTime(now);
  const rows = await DB.prepare(
    `SELECT e.entry_date, e.full_day, e.start_time, e.end_time
     FROM time_off_request r
     JOIN time_off_entry e ON e.request_id = r.id
     WHERE r.status = 'approved' AND r.user_id = ? AND e.entry_date = ?`,
  )
    .bind(userId, today)
    .all<{
      entry_date: string;
      full_day: number;
      start_time: string | null;
      end_time: string | null;
    }>();

  return (rows.results ?? []).some((row) =>
    isTimeOffEntryActiveNow(
      {
        date: row.entry_date,
        fullDay: row.full_day === 1,
        startTime: row.start_time,
        endTime: row.end_time,
      },
      today,
      clockTime,
    ),
  );
}
