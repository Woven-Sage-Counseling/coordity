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
