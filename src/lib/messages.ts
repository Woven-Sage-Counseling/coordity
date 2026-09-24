import { nowMs, randomToken } from './crypto';
import { getEnv } from './env';
import { notifyUser } from './notifications';
import { DEFAULT_ORG_ID } from './organization';

export const MESSAGE_SOURCE = 'message';
export const MESSAGE_BODY_MAX = 4000;
export const MESSAGE_THREAD_PAGE = 50;

export type ConversationKind = 'dm' | 'channel';

export interface MessageConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string;
  teamId: string | null;
  channelKey: string | null;
  updatedAt: number;
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string;
    senderId: string;
    senderName: string;
    createdAt: number;
  } | null;
  otherParticipant: { id: string; name: string } | null;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: number;
  deleted: boolean;
}

export interface MessageThread {
  conversation: {
    id: string;
    kind: ConversationKind;
    title: string;
    teamId: string | null;
    channelKey: string | null;
  };
  messages: MessageItem[];
  hasMore: boolean;
}

type ConversationRow = {
  id: string;
  org_id: string;
  kind: string;
  title: string | null;
  team_id: string | null;
  channel_key: string | null;
  dm_key: string | null;
  created_at: number;
  updated_at: number;
};

function dmKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort((a, b) => a.localeCompare(b)).join(':');
}

function trimBody(body: string): string {
  return body.replace(/\r\n/g, '\n').trim();
}

export async function ensureChannels(orgId = DEFAULT_ORG_ID): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();

  const generalId = orgId === DEFAULT_ORG_ID ? 'msgchan_general' : `msgchan_general_${orgId}`;
  await DB.prepare(
    `INSERT OR IGNORE INTO message_conversation
       (id, org_id, kind, title, team_id, channel_key, dm_key, created_at, updated_at)
     VALUES (?, ?, 'channel', 'General', NULL, 'general', NULL, ?, ?)`,
  )
    .bind(generalId, orgId, now, now)
    .run();

  const teams = await DB.prepare(
    `SELECT id, key, name FROM directory_team ORDER BY sort_order, name`,
  ).all<{ id: string; key: string; name: string }>();

  const teamInserts = (teams.results ?? []).map((team) => {
    const id = orgId === DEFAULT_ORG_ID ? `msgchan_${team.id}` : `msgchan_${orgId}_${team.id}`;
    return DB.prepare(
      `INSERT OR IGNORE INTO message_conversation
         (id, org_id, kind, title, team_id, channel_key, dm_key, created_at, updated_at)
       VALUES (?, ?, 'channel', ?, ?, ?, NULL, ?, ?)`,
    ).bind(id, orgId, team.name, team.id, team.key, now, now);
  });
  if (teamInserts.length > 0) await DB.batch(teamInserts);
}

async function getConversation(id: string): Promise<ConversationRow | null> {
  const { DB } = getEnv();
  return (
    (await DB.prepare(
      `SELECT id, org_id, kind, title, team_id, channel_key, dm_key, created_at, updated_at
       FROM message_conversation WHERE id = ?`,
    )
      .bind(id)
      .first<ConversationRow>()) ?? null
  );
}

async function isActiveEmployee(userId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT 1 AS ok FROM employee_profile WHERE user_id = ? AND status = 'active'`,
  )
    .bind(userId)
    .first<{ ok: number }>();
  return Boolean(row);
}

async function userOnTeam(userId: string, teamId: string): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT 1 AS ok FROM user_team WHERE user_id = ? AND team_id = ?`,
  )
    .bind(userId, teamId)
    .first<{ ok: number }>();
  return Boolean(row);
}

/** Ensure participant row exists; new members start with last_read_at = now (no backlog flood). */
async function ensureParticipant(
  conversationId: string,
  userId: string,
  options: { lastReadAt?: number } = {},
): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();
  const lastRead = options.lastReadAt ?? now;
  await DB.prepare(
    `INSERT OR IGNORE INTO message_participant
       (conversation_id, user_id, joined_at, last_read_at, muted)
     VALUES (?, ?, ?, ?, 0)`,
  )
    .bind(conversationId, userId, now, lastRead)
    .run();
}

async function syncTeamChannelParticipants(conversation: ConversationRow): Promise<void> {
  if (conversation.kind !== 'channel' || !conversation.team_id) return;
  const { DB } = getEnv();
  const now = nowMs();
  const members = await DB.prepare(
    `SELECT ut.user_id AS user_id
     FROM user_team ut
     JOIN employee_profile p ON p.user_id = ut.user_id
     WHERE ut.team_id = ? AND p.status = 'active'`,
  )
    .bind(conversation.team_id)
    .all<{ user_id: string }>();

  for (const member of members.results ?? []) {
    await DB.prepare(
      `INSERT OR IGNORE INTO message_participant
         (conversation_id, user_id, joined_at, last_read_at, muted)
       VALUES (?, ?, ?, ?, 0)`,
    )
      .bind(conversation.id, member.user_id, now, now)
      .run();
  }
}

export async function canAccessConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const conversation = await getConversation(conversationId);
  if (!conversation) return false;
  if (!(await isActiveEmployee(userId))) return false;

  if (conversation.kind === 'dm') {
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT 1 AS ok FROM message_participant
       WHERE conversation_id = ? AND user_id = ?`,
    )
      .bind(conversationId, userId)
      .first<{ ok: number }>();
    return Boolean(row);
  }

  // General channel
  if (!conversation.team_id) {
    await ensureParticipant(conversationId, userId);
    return true;
  }

  if (!(await userOnTeam(userId, conversation.team_id))) return false;
  await ensureParticipant(conversationId, userId);
  return true;
}

export async function findOrCreateDm(input: {
  userId: string;
  recipientId: string;
  orgId?: string;
}): Promise<{ id: string; created: boolean }> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  if (input.userId === input.recipientId) {
    throw new Error('You cannot message yourself.');
  }
  if (!(await isActiveEmployee(input.recipientId))) {
    throw new Error('That person is not available to message.');
  }
  if (!(await isActiveEmployee(input.userId))) {
    throw new Error('Unauthorized');
  }

  const { DB } = getEnv();
  const key = dmKeyFor(input.userId, input.recipientId);
  const existing = await DB.prepare(
    `SELECT id FROM message_conversation WHERE kind = 'dm' AND dm_key = ?`,
  )
    .bind(key)
    .first<{ id: string }>();

  if (existing?.id) {
    await ensureParticipant(existing.id, input.userId);
    await ensureParticipant(existing.id, input.recipientId);
    return { id: existing.id, created: false };
  }

  const now = nowMs();
  const id = `msgdm_${randomToken(12)}`;
  await DB.prepare(
    `INSERT INTO message_conversation
       (id, org_id, kind, title, team_id, channel_key, dm_key, created_at, updated_at)
     VALUES (?, ?, 'dm', NULL, NULL, NULL, ?, ?, ?)`,
  )
    .bind(id, orgId, key, now, now)
    .run();

  await DB.batch([
    DB.prepare(
      `INSERT INTO message_participant
         (conversation_id, user_id, joined_at, last_read_at, muted)
       VALUES (?, ?, ?, ?, 0)`,
    ).bind(id, input.userId, now, now),
    DB.prepare(
      `INSERT INTO message_participant
         (conversation_id, user_id, joined_at, last_read_at, muted)
       VALUES (?, ?, ?, ?, 0)`,
    ).bind(id, input.recipientId, now, now),
  ]);

  return { id, created: true };
}

async function conversationTitleForUser(
  conversation: ConversationRow,
  userId: string,
): Promise<{ title: string; other: { id: string; name: string } | null }> {
  if (conversation.kind === 'channel') {
    return { title: conversation.title || 'Channel', other: null };
  }
  const { DB } = getEnv();
  const other = await DB.prepare(
    `SELECT u.id, u.name
     FROM message_participant mp
     JOIN user u ON u.id = mp.user_id
     WHERE mp.conversation_id = ? AND mp.user_id != ?
     LIMIT 1`,
  )
    .bind(conversation.id, userId)
    .first<{ id: string; name: string }>();

  return {
    title: other?.name || 'Direct message',
    other: other ? { id: other.id, name: other.name } : null,
  };
}

export async function listInbox(userId: string, orgId = DEFAULT_ORG_ID): Promise<MessageConversationSummary[]> {
  await ensureChannels(orgId);
  const { DB } = getEnv();

  // Ensure General access + team channel access for this user.
  const channels = await DB.prepare(
    `SELECT id, org_id, kind, title, team_id, channel_key, dm_key, created_at, updated_at
     FROM message_conversation
     WHERE org_id = ? AND kind = 'channel'`,
  )
    .bind(orgId)
    .all<ConversationRow>();

  const memberships = await DB.prepare(`SELECT team_id FROM user_team WHERE user_id = ?`)
    .bind(userId)
    .all<{ team_id: string }>();
  const teamIds = new Set((memberships.results ?? []).map((row) => row.team_id));
  const now = nowMs();
  const participantInserts = (channels.results ?? [])
    .filter((channel) => !channel.team_id || teamIds.has(channel.team_id))
    .map((channel) =>
      DB.prepare(
        `INSERT OR IGNORE INTO message_participant
           (conversation_id, user_id, joined_at, last_read_at, muted)
         VALUES (?, ?, ?, ?, 0)`,
      ).bind(channel.id, userId, now, now),
    );
  if (participantInserts.length > 0) await DB.batch(participantInserts);

  const rows = await DB.prepare(
    `SELECT c.id, c.kind, c.title, c.team_id, c.channel_key, c.updated_at,
            (
              SELECT COUNT(*)
              FROM message m
              WHERE m.conversation_id = c.id
                AND m.deleted_at IS NULL
                AND m.created_at > COALESCE(mp.last_read_at, 0)
                AND m.sender_id != ?
            ) AS unread_count,
            last.id AS last_id,
            last.body AS last_body,
            last.sender_id AS last_sender_id,
            last.created_at AS last_created_at,
            last_user.name AS last_sender_name,
            other.id AS other_id,
            other.name AS other_name
     FROM message_conversation c
     JOIN message_participant mp ON mp.conversation_id = c.id AND mp.user_id = ?
     LEFT JOIN message last ON last.id = (
       SELECT m.id
       FROM message m
       WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC
       LIMIT 1
     )
     LEFT JOIN user last_user ON last_user.id = last.sender_id
     LEFT JOIN user other ON other.id = (
       SELECT mp2.user_id
       FROM message_participant mp2
       WHERE mp2.conversation_id = c.id AND mp2.user_id != ? AND c.kind = 'dm'
       LIMIT 1
     )
     WHERE c.org_id = ?
       AND (
         c.kind = 'dm'
         OR c.team_id IS NULL
         OR EXISTS (
           SELECT 1 FROM user_team ut
           WHERE ut.user_id = ? AND ut.team_id = c.team_id
         )
       )
     ORDER BY c.updated_at DESC, c.created_at DESC`,
  )
    .bind(userId, userId, userId, orgId, userId)
    .all<{
      id: string;
      kind: string;
      title: string | null;
      team_id: string | null;
      channel_key: string | null;
      updated_at: number;
      unread_count: number;
      last_id: string | null;
      last_body: string | null;
      last_sender_id: string | null;
      last_created_at: number | null;
      last_sender_name: string | null;
      other_id: string | null;
      other_name: string | null;
    }>();

  return (rows.results ?? []).map((row) => {
    const other =
      row.kind === 'dm' && row.other_id && row.other_name
        ? { id: row.other_id, name: row.other_name }
        : null;
    return {
      id: row.id,
      kind: row.kind === 'channel' ? 'channel' : 'dm',
      title: row.kind === 'channel' ? row.title || 'Channel' : other?.name || 'Direct message',
      teamId: row.team_id,
      channelKey: row.channel_key,
      updatedAt: row.updated_at,
      unreadCount: Number(row.unread_count ?? 0),
      lastMessage:
        row.last_id && row.last_body && row.last_sender_id && row.last_created_at
          ? {
              id: row.last_id,
              body: row.last_body,
              senderId: row.last_sender_id,
              senderName: row.last_sender_name || 'Someone',
              createdAt: row.last_created_at,
            }
          : null,
      otherParticipant: other,
    } satisfies MessageConversationSummary;
  });
}

export async function listChannelsForUser(
  userId: string,
  orgId = DEFAULT_ORG_ID,
): Promise<MessageConversationSummary[]> {
  const inbox = await listInbox(userId, orgId);
  return inbox.filter((item) => item.kind === 'channel');
}

export async function getThread(input: {
  conversationId: string;
  userId: string;
  before?: number | null;
  limit?: number;
  markRead?: boolean;
}): Promise<MessageThread> {
  const limit = Math.min(Math.max(input.limit ?? MESSAGE_THREAD_PAGE, 1), 100);
  if (!(await canAccessConversation(input.conversationId, input.userId))) {
    throw new Error('Conversation not found.');
  }

  const conversation = await getConversation(input.conversationId);
  if (!conversation) throw new Error('Conversation not found.');

  if (conversation.kind === 'channel' && conversation.team_id) {
    await syncTeamChannelParticipants(conversation);
  }

  const { DB } = getEnv();
  const before = input.before && Number.isFinite(input.before) ? input.before : null;

  const rows = before
    ? await DB.prepare(
        `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, m.deleted_at,
                u.name AS sender_name
         FROM message m
         JOIN user u ON u.id = m.sender_id
         WHERE m.conversation_id = ? AND m.created_at < ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
        .bind(input.conversationId, before, limit + 1)
        .all<{
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: number;
          deleted_at: number | null;
          sender_name: string;
        }>()
    : await DB.prepare(
        `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, m.deleted_at,
                u.name AS sender_name
         FROM message m
         JOIN user u ON u.id = m.sender_id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at DESC
         LIMIT ?`,
      )
        .bind(input.conversationId, limit + 1)
        .all<{
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: number;
          deleted_at: number | null;
          sender_name: string;
        }>();

  const resultRows = rows.results ?? [];
  const hasMore = resultRows.length > limit;
  const page = hasMore ? resultRows.slice(0, limit) : resultRows;
  page.reverse();

  if (input.markRead !== false) {
    await markConversationRead(input.conversationId, input.userId);
  }

  const { title } = await conversationTitleForUser(conversation, input.userId);

  return {
    conversation: {
      id: conversation.id,
      kind: conversation.kind === 'channel' ? 'channel' : 'dm',
      title,
      teamId: conversation.team_id,
      channelKey: conversation.channel_key,
    },
    messages: page.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      body: row.deleted_at ? '' : row.body,
      createdAt: row.created_at,
      deleted: row.deleted_at != null,
    })),
    hasMore,
  };
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const { DB } = getEnv();
  const now = nowMs();
  await ensureParticipant(conversationId, userId, { lastReadAt: now });
  await DB.prepare(
    `UPDATE message_participant
     SET last_read_at = ?
     WHERE conversation_id = ? AND user_id = ?`,
  )
    .bind(now, conversationId, userId)
    .run();
}

export async function countUnreadMessages(userId: string, orgId = DEFAULT_ORG_ID): Promise<number> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT COUNT(*) AS count
       FROM message m
       JOIN message_participant mp ON mp.conversation_id = m.conversation_id AND mp.user_id = ?
       JOIN message_conversation c ON c.id = m.conversation_id
       WHERE c.org_id = ?
         AND m.deleted_at IS NULL
         AND m.created_at > COALESCE(mp.last_read_at, 0)
         AND m.sender_id != ?
         AND (
           c.kind = 'dm'
           OR c.team_id IS NULL
           OR EXISTS (
             SELECT 1 FROM user_team ut
             WHERE ut.user_id = ? AND ut.team_id = c.team_id
           )
         )`,
    )
      .bind(userId, orgId, userId, userId)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
}): Promise<MessageItem> {
  const body = trimBody(input.body);
  if (!body) throw new Error('Write a message first.');
  if (body.length > MESSAGE_BODY_MAX) {
    throw new Error(`Messages can be at most ${MESSAGE_BODY_MAX} characters.`);
  }
  if (!(await canAccessConversation(input.conversationId, input.senderId))) {
    throw new Error('Conversation not found.');
  }

  const conversation = await getConversation(input.conversationId);
  if (!conversation) throw new Error('Conversation not found.');

  const { DB } = getEnv();
  const now = nowMs();
  const id = `msg_${randomToken(12)}`;

  await DB.batch([
    DB.prepare(
      `INSERT INTO message (id, conversation_id, sender_id, body, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).bind(id, input.conversationId, input.senderId, body, now),
    DB.prepare(
      `UPDATE message_conversation SET updated_at = ? WHERE id = ?`,
    ).bind(now, input.conversationId),
    DB.prepare(
      `UPDATE message_participant SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`,
    ).bind(now, input.conversationId, input.senderId),
  ]);

  // Notify other participants (skip muted). General fans out to all active employees.
  let recipientRows: { user_id: string; muted: number }[] = [];

  if (conversation.kind === 'channel' && !conversation.team_id) {
    const active = await DB.prepare(
      `SELECT u.id AS user_id, COALESCE(mp.muted, 0) AS muted
       FROM user u
       JOIN employee_profile p ON p.user_id = u.id
       LEFT JOIN message_participant mp
         ON mp.conversation_id = ? AND mp.user_id = u.id
       WHERE p.status = 'active' AND u.id != ?`,
    )
      .bind(input.conversationId, input.senderId)
      .all<{ user_id: string; muted: number }>();
    recipientRows = active.results ?? [];
  } else {
    if (conversation.kind === 'channel' && conversation.team_id) {
      await syncTeamChannelParticipants(conversation);
    }
    const recipients = await DB.prepare(
      `SELECT mp.user_id AS user_id, mp.muted AS muted
       FROM message_participant mp
       JOIN employee_profile p ON p.user_id = mp.user_id
       WHERE mp.conversation_id = ?
         AND mp.user_id != ?
         AND p.status = 'active'`,
    )
      .bind(input.conversationId, input.senderId)
      .all<{ user_id: string; muted: number }>();
    recipientRows = recipients.results ?? [];
  }

  const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body;
  const { title } = await conversationTitleForUser(conversation, input.senderId);
  const notifyTitle =
    conversation.kind === 'dm'
      ? `Message from ${input.senderName}`
      : `${input.senderName} in ${title}`;

  for (const recipient of recipientRows) {
    if (recipient.muted) continue;
    await ensureParticipant(input.conversationId, recipient.user_id);
    await notifyUser({
      userId: recipient.user_id,
      title: notifyTitle,
      body: preview,
      sourceType: MESSAGE_SOURCE,
      sourceId: input.conversationId,
    });
  }

  return {
    id,
    conversationId: input.conversationId,
    senderId: input.senderId,
    senderName: input.senderName,
    body,
    createdAt: now,
    deleted: false,
  };
}

export async function softDeleteOwnMessage(input: {
  messageId: string;
  userId: string;
}): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, conversation_id, sender_id FROM message WHERE id = ? AND deleted_at IS NULL`,
  )
    .bind(input.messageId)
    .first<{ id: string; conversation_id: string; sender_id: string }>();

  if (!row) throw new Error('Message not found.');
  if (row.sender_id !== input.userId) throw new Error('You can only delete your own messages.');
  if (!(await canAccessConversation(row.conversation_id, input.userId))) {
    throw new Error('Message not found.');
  }

  await DB.prepare(`UPDATE message SET deleted_at = ?, body = '' WHERE id = ?`)
    .bind(nowMs(), input.messageId)
    .run();
}
