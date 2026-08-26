import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';

export const CALENDAR_CONFLICT_SOURCE = 'calendar_conflict';
export const TIME_OFF_REQUEST_SOURCE = 'time_off_request';

export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  unread: boolean;
  sourceType: string | null;
  sourceId: string | null;
  cleared: boolean;
}

function mapNotification(row: {
  id: string;
  title: string;
  body: string;
  created_at: number;
  read_at: number | null;
  source_type: string | null;
  source_id?: string | null;
  cleared_at: number | null;
}): PortalNotification {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    unread: row.read_at == null,
    sourceType: row.source_type,
    sourceId: row.source_id ?? null,
    cleared: row.cleared_at != null,
  };
}

export async function listNotificationsForUser(
  userId: string,
  limit = 20,
  options: { includeCleared?: boolean; clearedOnly?: boolean } = {},
): Promise<PortalNotification[]> {
  const { DB } = getEnv();
  const clearedFilter = options.clearedOnly
    ? 'AND cleared_at IS NOT NULL'
    : options.includeCleared
      ? ''
      : 'AND cleared_at IS NULL';

  try {
    const rows = await DB.prepare(
      `SELECT id, title, body, created_at, read_at, source_type, source_id, cleared_at
       FROM notification
       WHERE user_id = ?
         ${clearedFilter}
       ORDER BY created_at DESC
       LIMIT ?`,
    )
      .bind(userId, limit)
      .all<{
        id: string;
        title: string;
        body: string;
        created_at: number;
        read_at: number | null;
        source_type: string | null;
        source_id: string | null;
        cleared_at: number | null;
      }>();

    return (rows.results ?? []).map(mapNotification);
  } catch {
    // Fallback before migration 0015 is applied.
    const rows = await DB.prepare(
      `SELECT id, title, body, created_at, read_at, source_type
       FROM notification
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
      .bind(userId, limit)
      .all<{
        id: string;
        title: string;
        body: string;
        created_at: number;
        read_at: number | null;
        source_type: string | null;
      }>();

    return (rows.results ?? []).map((row) =>
      mapNotification({ ...row, source_id: null, cleared_at: null }),
    );
  }
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT COUNT(*) AS count
       FROM notification
       WHERE user_id = ? AND read_at IS NULL AND cleared_at IS NULL`,
    )
      .bind(userId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    const row = await DB.prepare(
      `SELECT COUNT(*) AS count
       FROM notification
       WHERE user_id = ? AND read_at IS NULL`,
    )
      .bind(userId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }
}

export async function markNotificationsRead(input: {
  userId: string;
  notificationIds?: string[];
}): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();

  if (input.notificationIds?.length) {
    await DB.batch(
      input.notificationIds.map((id) =>
        DB.prepare(
          `UPDATE notification
           SET read_at = ?
           WHERE id = ? AND user_id = ? AND read_at IS NULL`,
        ).bind(now, id, input.userId),
      ),
    );
    return;
  }

  await DB.prepare(
    `UPDATE notification
     SET read_at = ?
     WHERE user_id = ? AND read_at IS NULL`,
  )
    .bind(now, input.userId)
    .run();
}

export async function markNotificationsUnread(input: {
  userId: string;
  notificationIds: string[];
}): Promise<void> {
  if (input.notificationIds.length === 0) return;
  const { DB } = getEnv();
  await DB.batch(
    input.notificationIds.map((id) =>
      DB.prepare(
        `UPDATE notification
         SET read_at = NULL
         WHERE id = ? AND user_id = ?`,
      ).bind(id, input.userId),
    ),
  );
}

export async function clearNotifications(input: {
  userId: string;
  notificationIds: string[];
}): Promise<void> {
  if (input.notificationIds.length === 0) return;
  const { DB } = getEnv();
  const now = nowMs();
  try {
    await DB.batch(
      input.notificationIds.map((id) =>
        DB.prepare(
          `UPDATE notification
           SET cleared_at = ?, read_at = COALESCE(read_at, ?)
           WHERE id = ? AND user_id = ? AND cleared_at IS NULL
             AND (source_type IS NULL OR source_type != ?)`,
        ).bind(now, now, id, input.userId, CALENDAR_CONFLICT_SOURCE),
      ),
    );
  } catch {
    // If cleared_at is missing, fall back to hard delete for non-conflict alerts.
    await DB.batch(
      input.notificationIds.map((id) =>
        DB.prepare(
          `DELETE FROM notification
           WHERE id = ? AND user_id = ?
             AND (source_type IS NULL OR source_type != ?)`,
        ).bind(id, input.userId, CALENDAR_CONFLICT_SOURCE),
      ),
    );
  }
}

export async function deleteNotificationsPermanently(input: {
  userId: string;
  notificationIds: string[];
}): Promise<void> {
  if (input.notificationIds.length === 0) return;
  const { DB } = getEnv();
  await DB.batch(
    input.notificationIds.map((id) =>
      DB.prepare(`DELETE FROM notification WHERE id = ? AND user_id = ?`).bind(id, input.userId),
    ),
  );
}

export async function notifyUser(input: {
  userId: string;
  title: string;
  body: string;
  sourceType?: string;
  sourceId?: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO notification
       (id, user_id, title, body, created_at, read_at, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      randomToken(16),
      input.userId,
      input.title,
      input.body,
      nowMs(),
      input.sourceType ?? null,
      input.sourceId ?? null,
    )
    .run();
}

export async function listNotificationSourceIds(
  userId: string,
  sourceType: string,
): Promise<Set<string>> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT source_id
     FROM notification
     WHERE user_id = ? AND source_type = ? AND source_id IS NOT NULL`,
  )
    .bind(userId, sourceType)
    .all<{ source_id: string }>();

  return new Set((rows.results ?? []).map((row) => row.source_id));
}

export async function deleteNotificationsBySourceOutsideRange(
  userId: string,
  sourceType: string,
  activeSourceIds: string[],
  rangeStart: string,
  rangeEnd: string,
): Promise<void> {
  const { DB } = getEnv();
  const active = new Set(activeSourceIds);

  const rows = await DB.prepare(
    `SELECT id, source_id
     FROM notification
     WHERE user_id = ? AND source_type = ? AND source_id IS NOT NULL`,
  )
    .bind(userId, sourceType)
    .all<{ id: string; source_id: string }>();

  const toDelete = (rows.results ?? []).filter((row) => {
    const dayKey = row.source_id.slice(0, 10);
    if (dayKey < rangeStart || dayKey > rangeEnd) return false;
    return !active.has(row.source_id);
  });

  if (toDelete.length === 0) return;
  await DB.batch(
    toDelete.map((row) =>
      DB.prepare(`DELETE FROM notification WHERE id = ? AND user_id = ?`).bind(row.id, userId),
    ),
  );
}

export async function notifyActiveUsers(input: {
  title: string;
  body: string;
  excludeUserId?: string;
  sourceType?: string;
  sourceId?: string;
}): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();

  const users = await DB.prepare(
    `SELECT u.id
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     WHERE p.status = 'active'
       AND (? IS NULL OR u.id != ?)`,
  )
    .bind(input.excludeUserId ?? null, input.excludeUserId ?? null)
    .all<{ id: string }>();

  const recipients = users.results ?? [];
  if (recipients.length === 0) return;

  await DB.batch(
    recipients.map((user) =>
      DB.prepare(
        `INSERT INTO notification
           (id, user_id, title, body, created_at, read_at, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        randomToken(16),
        user.id,
        input.title,
        input.body,
        now,
        input.sourceType ?? null,
        input.sourceId ?? null,
      ),
    ),
  );
}

/** Notify primary owner + Owner (view) accounts with admin access. */
export async function notifyManagementUsers(input: {
  title: string;
  body: string;
  excludeUserId?: string;
  sourceType?: string;
  sourceId?: string;
}): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();
  const ownerEmail = (getEnv().PORTAL_OWNER_EMAIL ?? '').trim().toLowerCase();
  const excludeId = input.excludeUserId?.trim() || null;
  const recipientIds = new Set<string>();

  const byRole = await DB.prepare(
    `SELECT DISTINCT u.id
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     JOIN user_role ur ON ur.user_id = u.id
     JOIN role r ON r.id = ur.role_id
     WHERE p.status = 'active'
       AND r.key IN ('owner', 'owner_view')`,
  ).all<{ id: string }>();

  for (const row of byRole.results ?? []) {
    recipientIds.add(row.id);
  }

  if (ownerEmail) {
    const byEmail = await DB.prepare(
      `SELECT u.id
       FROM user u
       JOIN employee_profile p ON p.user_id = u.id
       WHERE p.status = 'active'
         AND lower(trim(u.email)) = ?`,
    )
      .bind(ownerEmail)
      .first<{ id: string }>();
    if (byEmail?.id) recipientIds.add(byEmail.id);
  }

  const recipients = [...recipientIds].filter((id) => id !== excludeId);
  if (recipients.length === 0) {
    console.error('notifyManagementUsers: no admin recipients found', {
      ownerEmailSet: Boolean(ownerEmail),
      roleMatchCount: byRole.results?.length ?? 0,
      excludeId,
    });
    return;
  }

  await DB.batch(
    recipients.map((userId) =>
      DB.prepare(
        `INSERT INTO notification
           (id, user_id, title, body, created_at, read_at, source_type, source_id)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).bind(
        randomToken(16),
        userId,
        input.title,
        input.body,
        now,
        input.sourceType ?? null,
        input.sourceId ?? null,
      ),
    ),
  );
}

export async function deleteNotificationsBySource(
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM notification WHERE source_type = ? AND source_id = ?`)
    .bind(sourceType, sourceId)
    .run();
}
