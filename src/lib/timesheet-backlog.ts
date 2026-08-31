import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { formatHours, formatWorkDate } from './timesheet';
import { createBacklogShift } from './timesheet-entries';

export type TimesheetBacklogStatus = 'pending' | 'approved' | 'denied';

export interface TimesheetBacklogRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  workDate: string;
  minutes: number;
  notes: string | null;
  status: TimesheetBacklogStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  shiftId: string | null;
  createdAt: number;
}

type BacklogRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  work_date: string;
  minutes: number;
  notes: string | null;
  status: TimesheetBacklogStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: number | null;
  shift_id: string | null;
  created_at: number;
};

const BACKLOG_SELECT = `
  SELECT
    b.id,
    b.user_id,
    u.name AS user_name,
    u.email AS user_email,
    b.work_date,
    b.minutes,
    b.notes,
    b.status,
    b.reviewed_by,
    reviewer.name AS reviewer_name,
    b.reviewed_at,
    b.shift_id,
    b.created_at
  FROM timesheet_backlog b
  JOIN user u ON u.id = b.user_id
  LEFT JOIN user reviewer ON reviewer.id = b.reviewed_by
`;

function mapBacklog(row: BacklogRow): TimesheetBacklogRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    workDate: row.work_date,
    minutes: row.minutes,
    notes: row.notes,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    shiftId: row.shift_id,
    createdAt: row.created_at,
  };
}

export function backlogStatusLabel(status: TimesheetBacklogStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Denied';
  return 'Pending';
}

export function formatBacklogRequestDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function serializeBacklogRequest(request: TimesheetBacklogRequest) {
  return {
    id: request.id,
    workDate: request.workDate,
    dateLabel: formatWorkDate(request.workDate),
    hoursLabel: formatHours(request.minutes),
    minutes: request.minutes,
    notes: request.notes,
    status: request.status,
    statusLabel: backlogStatusLabel(request.status),
    createdAtLabel: formatBacklogRequestDate(request.createdAt),
  };
}

export async function createTimesheetBacklogRequest(input: {
  userId: string;
  workDate: string;
  minutes: number;
  notes: string | null;
}): Promise<{ id: string; createdAt: number }> {
  const { DB } = getEnv();
  const id = randomToken(16);
  const createdAt = nowMs();

  await DB.prepare(
    `INSERT INTO timesheet_backlog
       (id, user_id, work_date, minutes, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(id, input.userId, input.workDate, input.minutes, input.notes, createdAt)
    .run();

  return { id, createdAt };
}

export async function listTimesheetBacklogForUser(
  userId: string,
  limit = 20,
): Promise<TimesheetBacklogRequest[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${BACKLOG_SELECT}
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<BacklogRow>();

  return (rows.results ?? []).map(mapBacklog);
}

export async function listTimesheetBacklogForAdmin(limit = 100): Promise<TimesheetBacklogRequest[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${BACKLOG_SELECT}
     WHERE b.status = 'pending'
        OR (b.status = 'approved' AND b.work_date >= date('now', '-30 day'))
     ORDER BY
       CASE b.status WHEN 'pending' THEN 0 ELSE 1 END,
       b.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<BacklogRow>();

  return (rows.results ?? []).map(mapBacklog);
}

export async function reviewTimesheetBacklogRequest(
  requestId: string,
  reviewerId: string,
  status: Exclude<TimesheetBacklogStatus, 'pending'>,
): Promise<TimesheetBacklogRequest> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `${BACKLOG_SELECT} WHERE b.id = ?`,
  )
    .bind(requestId)
    .first<BacklogRow>();

  if (!existing) throw new Error('Backlog request not found.');
  if (existing.status !== 'pending') throw new Error('That backlog request was already reviewed.');

  const reviewedAt = nowMs();
  let shiftId: string | null = existing.shift_id;

  if (status === 'approved') {
    const shift = await createBacklogShift({
      userId: existing.user_id,
      workDate: existing.work_date,
      minutes: existing.minutes,
      notes: existing.notes,
      backlogId: existing.id,
    });
    shiftId = shift.id;
  }

  await DB.prepare(
    `UPDATE timesheet_backlog
     SET status = ?, reviewed_by = ?, reviewed_at = ?, shift_id = ?
     WHERE id = ?`,
  )
    .bind(status, reviewerId, reviewedAt, shiftId, requestId)
    .run();

  const row = await DB.prepare(`${BACKLOG_SELECT} WHERE b.id = ?`).bind(requestId).first<BacklogRow>();
  if (!row) throw new Error('Unable to load reviewed backlog request.');
  return mapBacklog(row);
}

export function buildTimesheetBacklogEmail(input: {
  employeeName: string;
  employeeEmail: string;
  workDate: string;
  minutes: number;
  notes: string | null;
}): { subject: string; text: string; html: string; replyTo: string } {
  const hoursLabel = formatHours(input.minutes);
  const dateLabel = formatWorkDate(input.workDate);
  const subject = `Timesheet backlog request from ${input.employeeName}`;
  const textParts = [
    `${input.employeeName} (${input.employeeEmail}) submitted backlog hours for approval:`,
    '',
    `Date: ${dateLabel}`,
    `Hours: ${hoursLabel}`,
  ];
  if (input.notes) textParts.push('', `Notes: ${input.notes}`);
  textParts.push('', 'Review this request in the portal admin panel.');

  const html = `
    <p><strong>${escapeHtml(input.employeeName)}</strong> (${escapeHtml(input.employeeEmail)}) submitted backlog hours for approval:</p>
    <p><strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
    <strong>Hours:</strong> ${escapeHtml(hoursLabel)}</p>
    ${input.notes ? `<p><strong>Notes:</strong> ${escapeHtml(input.notes)}</p>` : ''}
    <p style="color:#6b6c72;font-size:13px;">Review this request in the portal admin panel.</p>
  `.trim();

  return {
    subject,
    text: textParts.join('\n'),
    html,
    replyTo: input.employeeEmail,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
