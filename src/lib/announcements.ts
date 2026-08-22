import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';
import { writeAuditLog } from './audit';
import { notifyActiveUsers } from './notifications';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  authorName: string;
  createdAt: number;
  unread?: boolean;
}

export async function listActiveAnnouncements(limit = 20): Promise<Announcement[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT a.id, a.title, a.body, a.created_by, a.created_at, u.name AS author_name
     FROM announcement a
     JOIN user u ON u.id = a.created_by
     WHERE a.archived_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: string;
      title: string;
      body: string;
      created_by: string;
      created_at: number;
      author_name: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
  }));
}

export async function listAnnouncementsForUser(
  userId: string,
  limit = 20,
): Promise<Announcement[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        a.id,
        a.title,
        a.body,
        a.created_by,
        a.created_at,
        u.name AS author_name,
        CASE WHEN r.announcement_id IS NULL THEN 1 ELSE 0 END AS unread
     FROM announcement a
     JOIN user u ON u.id = a.created_by
     LEFT JOIN announcement_read r
       ON r.announcement_id = a.id AND r.user_id = ?
     WHERE a.archived_at IS NULL
     ORDER BY a.created_at DESC
     LIMIT ?`,
  )
    .bind(userId, limit)
    .all<{
      id: string;
      title: string;
      body: string;
      created_by: string;
      created_at: number;
      author_name: string;
      unread: number;
    }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    authorName: row.author_name,
    createdAt: row.created_at,
    unread: row.unread === 1,
  }));
}

export async function countUnreadAnnouncements(userId: string): Promise<number> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT COUNT(*) AS count
     FROM announcement a
     LEFT JOIN announcement_read r
       ON r.announcement_id = a.id AND r.user_id = ?
     WHERE a.archived_at IS NULL
       AND r.announcement_id IS NULL`,
  )
    .bind(userId)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function markAnnouncementsRead(input: {
  userId: string;
  announcementIds?: string[];
}): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();

  let ids = input.announcementIds;
  if (!ids) {
    const rows = await DB.prepare(
      `SELECT a.id
       FROM announcement a
       LEFT JOIN announcement_read r
         ON r.announcement_id = a.id AND r.user_id = ?
       WHERE a.archived_at IS NULL
         AND r.announcement_id IS NULL`,
    )
      .bind(input.userId)
      .all<{ id: string }>();
    ids = (rows.results ?? []).map((row) => row.id);
  }

  if (ids.length === 0) return;

  await DB.batch(
    ids.map((id) =>
      DB.prepare(
        `INSERT OR IGNORE INTO announcement_read (user_id, announcement_id, read_at)
         VALUES (?, ?, ?)`,
      ).bind(input.userId, id, now),
    ),
  );
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  actorUserId: string;
}): Promise<Announcement> {
  const { DB } = getEnv();
  const id = randomToken(16);
  const createdAt = nowMs();

  await DB.prepare(
    `INSERT INTO announcement (id, title, body, created_by, created_at, archived_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
  )
    .bind(id, input.title, input.body, input.actorUserId, createdAt)
    .run();

  // Author has already "seen" their own post.
  await DB.prepare(
    `INSERT OR IGNORE INTO announcement_read (user_id, announcement_id, read_at)
     VALUES (?, ?, ?)`,
  )
    .bind(input.actorUserId, id, createdAt)
    .run();

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'announcement.create',
    targetType: 'announcement',
    targetId: id,
  });

  const author = await DB.prepare(`SELECT name FROM user WHERE id = ?`)
    .bind(input.actorUserId)
    .first<{ name: string }>();

  const authorName = author?.name ?? 'Unknown';

  await notifyActiveUsers({
    title: 'New announcement',
    body: `${authorName}: ${input.title}`,
    excludeUserId: input.actorUserId,
    sourceType: 'announcement',
    sourceId: id,
  });

  return {
    id,
    title: input.title,
    body: input.body,
    createdBy: input.actorUserId,
    authorName,
    createdAt,
    unread: false,
  };
}

export async function archiveAnnouncement(input: {
  id: string;
  actorUserId: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`UPDATE announcement SET archived_at = ? WHERE id = ? AND archived_at IS NULL`)
    .bind(nowMs(), input.id)
    .run();

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'announcement.archive',
    targetType: 'announcement',
    targetId: input.id,
  });
}

export function formatAnnouncementDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}
