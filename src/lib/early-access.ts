import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';
import { notifyAdminEmail } from './email';
import { notifyUser } from './notifications';

export const EARLY_ACCESS_SOURCE = 'early_access_request';
export const EARLY_ACCESS_EMAIL_TO = 'admin@coordity.com';

export type EarlyAccessStatus = 'new' | 'reviewed';

export interface EarlyAccessRequest {
  id: string;
  name: string;
  email: string;
  practiceName: string;
  phone: string | null;
  title: string | null;
  message: string | null;
  status: EarlyAccessStatus;
  createdAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
}

type RequestRow = {
  id: string;
  name: string;
  email: string;
  practice_name: string;
  phone: string | null;
  title: string | null;
  message: string | null;
  status: string;
  created_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
};

function mapRow(row: RequestRow): EarlyAccessRequest {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    practiceName: row.practice_name,
    phone: row.phone,
    title: row.title,
    message: row.message,
    status: row.status === 'reviewed' ? 'reviewed' : 'new',
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
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

export function buildEarlyAccessEmail(input: {
  name: string;
  email: string;
  practiceName: string;
  phone?: string | null;
  title?: string | null;
  message?: string | null;
}): { subject: string; text: string; html: string; replyTo: string } {
  const subject = `Early access request from ${input.practiceName}`;
  const lines = [
    `${input.name} requested early access to Coordity.`,
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Practice: ${input.practiceName}`,
  ];
  if (input.title?.trim()) lines.push(`Title: ${input.title.trim()}`);
  if (input.phone?.trim()) lines.push(`Phone: ${input.phone.trim()}`);
  if (input.message?.trim()) {
    lines.push('', 'Message:', input.message.trim());
  }
  lines.push('', 'Submitted via coordity.com/early-access.');

  const htmlParts = [
    `<p><strong>${escapeHtml(input.name)}</strong> requested early access to Coordity.</p>`,
    `<p><strong>Email:</strong> ${escapeHtml(input.email)}<br/>`,
    `<strong>Practice:</strong> ${escapeHtml(input.practiceName)}`,
  ];
  if (input.title?.trim()) {
    htmlParts.push(`<br/><strong>Title:</strong> ${escapeHtml(input.title.trim())}`);
  }
  if (input.phone?.trim()) {
    htmlParts.push(`<br/><strong>Phone:</strong> ${escapeHtml(input.phone.trim())}`);
  }
  htmlParts.push('</p>');
  if (input.message?.trim()) {
    htmlParts.push(
      `<p><strong>Message:</strong></p><p style="white-space:pre-wrap;">${escapeHtml(input.message.trim())}</p>`,
    );
  }
  htmlParts.push(
    `<p style="color:#5b6b7c;font-size:13px;">Submitted via coordity.com/early-access. Review in Platform → Requests.</p>`,
  );

  return {
    subject,
    text: lines.join('\n'),
    html: htmlParts.join(''),
    replyTo: input.email,
  };
}

export async function createEarlyAccessRequest(input: {
  name: string;
  email: string;
  practiceName: string;
  phone?: string | null;
  title?: string | null;
  message?: string | null;
}): Promise<EarlyAccessRequest> {
  const { DB } = getEnv();
  const id = randomToken(16);
  const createdAt = nowMs();
  await DB.prepare(
    `INSERT INTO early_access_request
       (id, name, email, practice_name, phone, title, message, status, created_at, reviewed_at, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, NULL, NULL)`,
  )
    .bind(
      id,
      input.name,
      input.email.toLowerCase(),
      input.practiceName,
      input.phone?.trim() || null,
      input.title?.trim() || null,
      input.message?.trim() || null,
      createdAt,
    )
    .run();

  return {
    id,
    name: input.name,
    email: input.email.toLowerCase(),
    practiceName: input.practiceName,
    phone: input.phone?.trim() || null,
    title: input.title?.trim() || null,
    message: input.message?.trim() || null,
    status: 'new',
    createdAt,
    reviewedAt: null,
    reviewedBy: null,
  };
}

export async function listEarlyAccessRequests(options?: {
  status?: EarlyAccessStatus | 'all';
}): Promise<EarlyAccessRequest[]> {
  const { DB } = getEnv();
  const status = options?.status ?? 'all';
  const rows =
    status === 'all'
      ? await DB.prepare(
          `SELECT id, name, email, practice_name, phone, title, message, status, created_at, reviewed_at, reviewed_by
           FROM early_access_request
           ORDER BY created_at DESC
           LIMIT 200`,
        ).all<RequestRow>()
      : await DB.prepare(
          `SELECT id, name, email, practice_name, phone, title, message, status, created_at, reviewed_at, reviewed_by
           FROM early_access_request
           WHERE status = ?
           ORDER BY created_at DESC
           LIMIT 200`,
        )
          .bind(status)
          .all<RequestRow>();

  return (rows.results ?? []).map(mapRow);
}

export async function countNewEarlyAccessRequests(): Promise<number> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT COUNT(*) AS n FROM early_access_request WHERE status = 'new'`,
    ).first<{ n: number }>();
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function markEarlyAccessReviewed(input: {
  id: string;
  reviewedBy: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE early_access_request
     SET status = 'reviewed', reviewed_at = ?, reviewed_by = ?
     WHERE id = ?`,
  )
    .bind(nowMs(), input.reviewedBy, input.id)
    .run();
}

async function listActivePlatformStaffUserIds(): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT user_id FROM platform_staff WHERE status = 'active'`,
  ).all<{ user_id: string }>();
  return (rows.results ?? []).map((row) => row.user_id);
}

async function resolvePlatformOwnerUserId(): Promise<string | null> {
  const { DB } = getEnv();
  const ownerEmail = (
    getEnv().COORDITY_PLATFORM_OWNER_EMAIL ?? EARLY_ACCESS_EMAIL_TO
  )
    .trim()
    .toLowerCase();

  const byEmail = await DB.prepare(
    `SELECT u.id
     FROM user u
     JOIN platform_staff ps ON ps.user_id = u.id
     WHERE lower(u.email) = ? AND ps.status = 'active'
     LIMIT 1`,
  )
    .bind(ownerEmail)
    .first<{ id: string }>();
  if (byEmail?.id) return byEmail.id;

  const owner = await DB.prepare(
    `SELECT ps.user_id AS id
     FROM platform_staff ps
     JOIN platform_role pr ON pr.id = ps.role_id
     WHERE pr.key = 'platform_owner' AND ps.status = 'active'
     LIMIT 1`,
  ).first<{ id: string }>();
  return owner?.id ?? null;
}

export async function notifyPlatformOfEarlyAccess(input: {
  requestId: string;
  name: string;
  practiceName: string;
  email: string;
}): Promise<void> {
  const title = 'New early access request';
  const body = `${input.name} · ${input.practiceName} (${input.email})`;
  const staffIds = await listActivePlatformStaffUserIds();
  const ownerId = await resolvePlatformOwnerUserId();
  const recipients = new Set(staffIds);
  if (ownerId) recipients.add(ownerId);

  await Promise.all(
    [...recipients].map((userId) =>
      notifyUser({
        userId,
        title,
        body,
        sourceType: EARLY_ACCESS_SOURCE,
        sourceId: input.requestId,
      }).catch((error) => {
        console.error('platform early access notification failed', error);
      }),
    ),
  );
}

export async function submitEarlyAccessRequest(input: {
  name: string;
  email: string;
  practiceName: string;
  phone?: string | null;
  title?: string | null;
  message?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const practiceName = input.practiceName.trim();
  const phone = input.phone?.trim() || null;
  const title = input.title?.trim() || null;
  const message = input.message?.trim() || null;

  if (name.length < 2 || name.length > 80) {
    return { ok: false, error: 'Enter your name.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    return { ok: false, error: 'Enter a valid work email.' };
  }
  if (practiceName.length < 2 || practiceName.length > 120) {
    return { ok: false, error: 'Enter your practice or organization name.' };
  }
  if (phone && phone.length > 40) {
    return { ok: false, error: 'Phone number is too long.' };
  }
  if (title && title.length > 80) {
    return { ok: false, error: 'Title is too long.' };
  }
  if (message && message.length > 4000) {
    return { ok: false, error: 'Message is too long.' };
  }

  const request = await createEarlyAccessRequest({
    name,
    email,
    practiceName,
    phone,
    title,
    message,
  });

  try {
    await notifyPlatformOfEarlyAccess({
      requestId: request.id,
      name,
      practiceName,
      email,
    });
  } catch (error) {
    console.error('early access platform notify failed', error);
  }

  const sent = await notifyAdminEmail({
    ...buildEarlyAccessEmail({
      name,
      email,
      practiceName,
      phone,
      title,
      message,
    }),
    to: EARLY_ACCESS_EMAIL_TO,
  });

  if (!sent) {
    console.error('early access email failed after save', { id: request.id });
  }

  return { ok: true, id: request.id };
}
