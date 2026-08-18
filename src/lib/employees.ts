import { getEnv } from './env';
import { nowMs } from './crypto';
import { writeAuditLog } from './audit';
import type { Auth } from './auth';

export async function listEmployees() {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        u.id,
        u.email,
        u.name,
        COALESCE(p.status, 'pending') AS status,
        GROUP_CONCAT(r.key) AS roles
     FROM user u
     LEFT JOIN employee_profile p ON p.user_id = u.id
     LEFT JOIN user_role ur ON ur.user_id = u.id
     LEFT JOIN role r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.email`,
  ).all<{
    id: string;
    email: string;
    name: string;
    status: string;
    roles: string | null;
  }>();

  return (rows.results ?? []).map((row) => ({
    ...row,
    roles: row.roles ? row.roles.split(',') : [],
  }));
}

export async function listRoles() {
  const { DB } = getEnv();
  const rows = await DB.prepare(`SELECT id, key, name, description FROM role ORDER BY name`).all<{
    id: string;
    key: string;
    name: string;
    description: string;
  }>();
  return rows.results ?? [];
}

export async function assignRole(input: {
  userId: string;
  roleId: string;
  actorUserId: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.batch([
    DB.prepare(`DELETE FROM user_role WHERE user_id = ?`).bind(input.userId),
    DB.prepare(
      `INSERT INTO user_role (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`,
    ).bind(input.userId, input.roleId, input.actorUserId, nowMs()),
  ]);

  const role = await DB.prepare(`SELECT key FROM role WHERE id = ?`)
    .bind(input.roleId)
    .first<{ key: string }>();

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.role_changed',
    targetType: 'user',
    targetId: input.userId,
    metadata: { role: role?.key ?? input.roleId },
  });
}

export async function setEmployeeStatus(input: {
  userId: string;
  status: 'active' | 'disabled';
  actorUserId: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE employee_profile SET status = ?, updated_at = ? WHERE user_id = ?`,
  )
    .bind(input.status, nowMs(), input.userId)
    .run();

  if (input.status === 'disabled') {
    await DB.prepare(`DELETE FROM session WHERE user_id = ?`).bind(input.userId).run();
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: input.status === 'disabled' ? 'employee.disabled' : 'employee.reactivated',
    targetType: 'user',
    targetId: input.userId,
  });
}

export async function createInvitedAccount(
  auth: Auth,
  input: { email: string; name: string; password: string; roleId: string },
) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      emailVerified: true,
    },
    { method: 'email-password' },
  );
  if (!user) {
    throw new Error('Unable to create the employee account.');
  }

  const hashed = await ctx.password.hash(input.password);
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    accountId: user.id,
    providerId: 'credential',
    issuer: 'local:credential',
    password: hashed,
  });

  const { DB } = getEnv();
  const ts = nowMs();
  await DB.batch([
    DB.prepare(
      `INSERT INTO employee_profile (user_id, status, created_at, updated_at) VALUES (?, 'active', ?, ?)`,
    ).bind(user.id, ts, ts),
    DB.prepare(
      `INSERT INTO user_role (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`,
    ).bind(user.id, input.roleId, user.id, ts),
  ]);

  return user;
}

export async function ownerExists(): Promise<boolean> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT ur.user_id
     FROM user_role ur
     JOIN role r ON r.id = ur.role_id
     JOIN employee_profile p ON p.user_id = ur.user_id
     WHERE r.key = 'owner' AND p.status = 'active'
     LIMIT 1`,
  ).first();
  return Boolean(row);
}
