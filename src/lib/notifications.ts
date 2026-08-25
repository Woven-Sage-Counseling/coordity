import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';

export interface PortalNotification {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  unread: boolean;
}

export async function listNotificationsForUser(
  userId: string,
  limit = 20,
): Promise<PortalNotification[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, title, body, created_at, read_at
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
    }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    unread: row.read_at == null,
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT COUNT(*) AS count
     FROM notification
     WHERE user_id = ? AND read_at IS NULL`,
  )
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
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

export async function deleteNotificationsBySource(
  sourceType: string,
  sourceId: string,
): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM notification WHERE source_type = ? AND source_id = ?`)
    .bind(sourceType, sourceId)
    .run();
}
