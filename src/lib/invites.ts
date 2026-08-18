import { getEnv } from './env';
import { nowMs, randomToken, sha256Hex } from './crypto';
import { writeAuditLog } from './audit';

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function createInvitation(input: {
  email: string;
  name: string;
  roleId: string;
  actorUserId: string;
  origin: string;
}) {
  const { DB } = getEnv();
  const email = input.email.toLowerCase().trim();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = randomToken(16);
  const ts = nowMs();

  await DB.prepare(
    `INSERT INTO invitation (
      id, email, name, role_id, token_hash, invited_by, expires_at, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(id, email, input.name.trim(), input.roleId, tokenHash, input.actorUserId, ts + INVITE_TTL_MS, ts)
    .run();

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.invited',
    targetType: 'invitation',
    targetId: id,
    metadata: { email, roleId: input.roleId },
  });

  return {
    id,
    inviteUrl: `${input.origin}/accept-invite?token=${token}`,
  };
}

export async function getInvitationByToken(token: string) {
  const { DB } = getEnv();
  const tokenHash = await sha256Hex(token);
  const invite = await DB.prepare(
    `SELECT i.*, r.key AS role_key, r.name AS role_name
     FROM invitation i
     JOIN role r ON r.id = i.role_id
     WHERE i.token_hash = ?`,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      email: string;
      name: string;
      role_id: string;
      role_key: string;
      role_name: string;
      invited_by: string;
      expires_at: number;
      accepted_at: number | null;
      status: string;
    }>();

  if (!invite) return null;
  if (invite.status !== 'pending') return null;
  if (invite.expires_at < nowMs()) {
    await DB.prepare(`UPDATE invitation SET status = 'expired' WHERE id = ?`).bind(invite.id).run();
    return null;
  }
  return invite;
}

export async function markInvitationAccepted(id: string, userId: string) {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE invitation SET status = 'accepted', accepted_at = ? WHERE id = ?`,
  )
    .bind(nowMs(), id)
    .run();

  await writeAuditLog({
    actorUserId: userId,
    action: 'employee.invite_accepted',
    targetType: 'invitation',
    targetId: id,
  });
}

export async function listPendingInvites() {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT i.id, i.email, i.name, i.expires_at, i.status, r.name AS role_name
     FROM invitation i
     JOIN role r ON r.id = i.role_id
     WHERE i.status = 'pending'
     ORDER BY i.created_at DESC`,
  ).all<{
    id: string;
    email: string;
    name: string;
    expires_at: number;
    status: string;
    role_name: string;
  }>();
  return rows.results ?? [];
}
