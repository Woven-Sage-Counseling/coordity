import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import {
  easternDateFromMs,
  easternDateTimeToMs,
  addDays,
  formatHours,
  formatShiftRange,
  formatWorkDate,
  minutesBetween,
} from './timesheet';
import { applyApprovedShiftEdit, getShiftForUser } from './timesheet-entries';

export type TimesheetShiftEditStatus = 'pending' | 'approved' | 'denied';

export interface TimesheetShiftEditRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  shiftId: string;
  workDate: string;
  minutes: number;
  startedAt: number;
  endedAt: number;
  previousStartedAt: number | null;
  previousEndedAt: number | null;
  previousMinutes: number;
  notes: string | null;
  status: TimesheetShiftEditStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

type ShiftEditRow = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  shift_id: string;
  work_date: string;
  minutes: number;
  started_at: number;
  ended_at: number;
  previous_started_at: number | null;
  previous_ended_at: number | null;
  previous_minutes: number;
  notes: string | null;
  status: TimesheetShiftEditStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: number | null;
  created_at: number;
};

const SHIFT_EDIT_SELECT = `
  SELECT
    e.id,
    e.user_id,
    u.name AS user_name,
    u.email AS user_email,
    e.shift_id,
    e.work_date,
    e.minutes,
    e.started_at,
    e.ended_at,
    e.previous_started_at,
    e.previous_ended_at,
    e.previous_minutes,
    e.notes,
    e.status,
    e.reviewed_by,
    reviewer.name AS reviewer_name,
    e.reviewed_at,
    e.created_at
  FROM timesheet_shift_edit e
  JOIN user u ON u.id = e.user_id
  LEFT JOIN user reviewer ON reviewer.id = e.reviewed_by
`;

function mapShiftEdit(row: ShiftEditRow): TimesheetShiftEditRequest {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    shiftId: row.shift_id,
    workDate: row.work_date,
    minutes: row.minutes,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    previousStartedAt: row.previous_started_at,
    previousEndedAt: row.previous_ended_at,
    previousMinutes: row.previous_minutes,
    notes: row.notes,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export function shiftEditStatusLabel(status: TimesheetShiftEditStatus): string {
  if (status === 'approved') return 'Approved';
  if (status === 'denied') return 'Denied';
  return 'Pending';
}

export function formatShiftEditRequestDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function serializeShiftEditRequest(request: TimesheetShiftEditRequest) {
  const timeLabel = formatShiftRange(request.startedAt, request.endedAt);
  const previousTimeLabel =
    request.previousStartedAt != null && request.previousEndedAt != null
      ? formatShiftRange(request.previousStartedAt, request.previousEndedAt)
      : null;

  return {
    id: request.id,
    shiftId: request.shiftId,
    workDate: request.workDate,
    dateLabel: formatWorkDate(request.workDate),
    hoursLabel: formatHours(request.minutes),
    previousHoursLabel: formatHours(request.previousMinutes),
    timeLabel,
    previousTimeLabel,
    minutes: request.minutes,
    notes: request.notes,
    status: request.status,
    statusLabel: shiftEditStatusLabel(request.status),
    createdAtLabel: formatShiftEditRequestDate(request.createdAt),
  };
}

export async function listPendingShiftEditShiftIds(userId: string): Promise<Set<string>> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT shift_id
     FROM timesheet_shift_edit
     WHERE user_id = ? AND status = 'pending'`,
  )
    .bind(userId)
    .all<{ shift_id: string }>();

  return new Set((rows.results ?? []).map((row) => row.shift_id));
}

export async function createTimesheetShiftEditRequest(input: {
  userId: string;
  shiftId: string;
  workDate: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  notes: string | null;
}): Promise<{ id: string; createdAt: number }> {
  const shift = await getShiftForUser(input.shiftId, input.userId);
  if (!shift) throw new Error('Shift not found.');
  if (shift.endedAt == null) throw new Error('End your shift before requesting a time change.');
  if (shift.startedAt == null) throw new Error('This shift cannot be edited.');

  const { DB } = getEnv();

  const pending = await DB.prepare(
    `SELECT id FROM timesheet_shift_edit WHERE shift_id = ? AND status = 'pending' LIMIT 1`,
  )
    .bind(input.shiftId)
    .first<{ id: string }>();
  if (pending) throw new Error('This shift already has a pending time change request.');

  const unchanged =
    shift.startedAt === input.startedAt &&
    shift.endedAt === input.endedAt &&
    shift.workDate === input.workDate;
  if (unchanged) throw new Error('Enter different start or end times before submitting.');

  const id = randomToken(16);
  const createdAt = nowMs();

  await DB.prepare(
    `INSERT INTO timesheet_shift_edit
       (id, user_id, shift_id, work_date, started_at, ended_at, minutes,
        previous_started_at, previous_ended_at, previous_minutes, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(
      id,
      input.userId,
      input.shiftId,
      input.workDate,
      input.startedAt,
      input.endedAt,
      input.minutes,
      shift.startedAt,
      shift.endedAt,
      shift.minutes,
      input.notes,
      createdAt,
    )
    .run();

  return { id, createdAt };
}

export async function listTimesheetShiftEditsForUser(
  userId: string,
  limit = 20,
): Promise<TimesheetShiftEditRequest[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${SHIFT_EDIT_SELECT}
     WHERE e.user_id = ?
     ORDER BY e.created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<ShiftEditRow>();

  return (rows.results ?? []).map(mapShiftEdit);
}

export async function listTimesheetShiftEditsForAdmin(limit = 100): Promise<TimesheetShiftEditRequest[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `${SHIFT_EDIT_SELECT}
     WHERE e.status = 'pending'
        OR (e.status = 'approved' AND e.work_date >= date('now', '-30 day'))
     ORDER BY
       CASE e.status WHEN 'pending' THEN 0 ELSE 1 END,
       e.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<ShiftEditRow>();

  return (rows.results ?? []).map(mapShiftEdit);
}

export async function reviewTimesheetShiftEditRequest(
  requestId: string,
  reviewerId: string,
  status: Exclude<TimesheetShiftEditStatus, 'pending'>,
): Promise<TimesheetShiftEditRequest> {
  const { DB } = getEnv();
  const existing = await DB.prepare(`${SHIFT_EDIT_SELECT} WHERE e.id = ?`)
    .bind(requestId)
    .first<ShiftEditRow>();

  if (!existing) throw new Error('Time change request not found.');
  if (existing.status !== 'pending') throw new Error('That time change request was already reviewed.');

  const reviewedAt = nowMs();

  if (status === 'approved') {
    await applyApprovedShiftEdit({
      shiftId: existing.shift_id,
      userId: existing.user_id,
      startedAt: existing.started_at,
      endedAt: existing.ended_at,
      minutes: existing.minutes,
      workDate: existing.work_date,
    });
  }

  await DB.prepare(
    `UPDATE timesheet_shift_edit
     SET status = ?, reviewed_by = ?, reviewed_at = ?
     WHERE id = ?`,
  )
    .bind(status, reviewerId, reviewedAt, requestId)
    .run();

  const row = await DB.prepare(`${SHIFT_EDIT_SELECT} WHERE e.id = ?`).bind(requestId).first<ShiftEditRow>();
  if (!row) throw new Error('Unable to load reviewed time change request.');
  return mapShiftEdit(row);
}

export async function clearTimesheetShiftEditRequest(requestId: string): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(`SELECT status FROM timesheet_shift_edit WHERE id = ?`)
    .bind(requestId)
    .first<{ status: TimesheetShiftEditStatus }>();

  if (!existing) throw new Error('Time change request not found.');
  if (existing.status !== 'approved') {
    throw new Error('Only approved time change requests can be cleared.');
  }

  const result = await DB.prepare(
    `DELETE FROM timesheet_shift_edit WHERE id = ? AND status = 'approved'`,
  )
    .bind(requestId)
    .run();

  if ((result.meta.changes ?? 0) < 1) {
    throw new Error('That time change request could not be cleared.');
  }
}

export function parseShiftEditTimeRange(form: FormData): {
  shiftId: string;
  workDate: string;
  startedAt: number;
  endedAt: number;
  minutes: number;
  notes: string | null;
} {
  const shiftId = String(form.get('shiftId') ?? '').trim();
  if (!shiftId) throw new Error('Shift is required.');

  const workDate = String(form.get('workDate') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
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
  const resolvedWorkDate = easternDateFromMs(startedAt);

  return {
    shiftId,
    workDate: resolvedWorkDate,
    startedAt,
    endedAt,
    minutes,
    notes: notes || null,
  };
}

export function buildTimesheetShiftEditEmail(input: {
  employeeName: string;
  employeeEmail: string;
  workDate: string;
  minutes: number;
  startedAt: number;
  endedAt: number;
  previousStartedAt: number | null;
  previousEndedAt: number | null;
  previousMinutes: number;
  notes: string | null;
}): { subject: string; text: string; html: string; replyTo: string } {
  const hoursLabel = formatHours(input.minutes);
  const previousHoursLabel = formatHours(input.previousMinutes);
  const dateLabel = formatWorkDate(input.workDate);
  const timeLabel = formatShiftRange(input.startedAt, input.endedAt);
  const previousTimeLabel =
    input.previousStartedAt != null && input.previousEndedAt != null
      ? formatShiftRange(input.previousStartedAt, input.previousEndedAt)
      : null;
  const subject = `Timesheet time change request from ${input.employeeName}`;
  const textParts = [
    `${input.employeeName} (${input.employeeEmail}) requested a shift time change:`,
    '',
    `Date: ${dateLabel}`,
    previousTimeLabel ? `Current: ${previousTimeLabel} (${previousHoursLabel})` : `Current: ${previousHoursLabel}`,
    `Requested: ${timeLabel} (${hoursLabel})`,
  ];
  if (input.notes) textParts.push('', `Notes: ${input.notes}`);
  textParts.push('', 'Review this request in the portal admin panel.');

  const html = `
    <p><strong>${escapeHtml(input.employeeName)}</strong> (${escapeHtml(input.employeeEmail)}) requested a shift time change:</p>
    <p><strong>Date:</strong> ${escapeHtml(dateLabel)}<br />
    ${previousTimeLabel ? `<strong>Current:</strong> ${escapeHtml(previousTimeLabel)} (${escapeHtml(previousHoursLabel)})<br />` : `<strong>Current:</strong> ${escapeHtml(previousHoursLabel)}<br />`}
    <strong>Requested:</strong> ${escapeHtml(timeLabel)} (${escapeHtml(hoursLabel)})</p>
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
