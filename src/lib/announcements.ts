import { getEnv } from './env';
import { randomToken, nowMs } from './crypto';
import { writeAuditLog } from './audit';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  authorName: string;
  createdAt: number;
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

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'announcement.create',
    targetType: 'announcement',
    targetId: id,
  });

  const author = await DB.prepare(`SELECT name FROM user WHERE id = ?`)
    .bind(input.actorUserId)
    .first<{ name: string }>();

  return {
    id,
    title: input.title,
    body: input.body,
    createdBy: input.actorUserId,
    authorName: author?.name ?? 'Unknown',
    createdAt,
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
