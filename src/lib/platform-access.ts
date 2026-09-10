import { getEnv } from './env';
import { nowMs } from './crypto';

export const PLATFORM_PERMISSIONS = [
  'platform:access',
  'platform:orgs:read',
  'platform:orgs:create',
  'platform:orgs:delete',
  'platform:staff:manage',
  'platform:marketing:manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export interface PlatformStaff {
  userId: string;
  email: string;
  name: string;
  roleKey: string;
  roleName: string;
  status: 'active' | 'disabled';
  permissions: PlatformPermission[];
}

export async function loadPlatformStaff(userId: string): Promise<PlatformStaff | null> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT
          u.id AS user_id,
          u.email,
          u.name,
          ps.status,
          pr.key AS role_key,
          pr.name AS role_name
       FROM platform_staff ps
       JOIN user u ON u.id = ps.user_id
       JOIN platform_role pr ON pr.id = ps.role_id
       WHERE ps.user_id = ?`,
    )
      .bind(userId)
      .first<{
        user_id: string;
        email: string;
        name: string;
        status: string;
        role_key: string;
        role_name: string;
      }>();

    if (!row || row.status !== 'active') return null;

    const perms = await DB.prepare(
      `SELECT pp.key
       FROM platform_staff ps
       JOIN platform_role_permission prp ON prp.role_id = ps.role_id
       JOIN platform_permission pp ON pp.id = prp.permission_id
       WHERE ps.user_id = ?`,
    )
      .bind(userId)
      .all<{ key: PlatformPermission }>();

    return {
      userId: row.user_id,
      email: row.email,
      name: row.name,
      roleKey: row.role_key,
      roleName: row.role_name,
      status: 'active',
      permissions: (perms.results ?? []).map((p) => p.key),
    };
  } catch {
    return null;
  }
}

export function hasPlatformPermission(
  staff: { status: string; permissions: readonly string[] } | null,
  permission: PlatformPermission,
): boolean {
  if (!staff || staff.status !== 'active') return false;
  return staff.permissions.includes(permission);
}

export function requirePlatformPermission(
  staff: { status: string; permissions: readonly string[] } | null,
  permission: PlatformPermission,
): Response | null {
  if (!hasPlatformPermission(staff, permission)) {
    return new Response('Forbidden', { status: 403 });
  }
  return null;
}

export async function platformOwnerExists(): Promise<boolean> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT ps.user_id
       FROM platform_staff ps
       JOIN platform_role pr ON pr.id = ps.role_id
       WHERE pr.key = 'platform_owner' AND ps.status = 'active'
       LIMIT 1`,
    ).first();
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function upsertPlatformStaff(input: {
  userId: string;
  roleId: string;
  status?: 'active' | 'disabled';
}): Promise<void> {
  const { DB } = getEnv();
  const ts = nowMs();
  await DB.prepare(
    `INSERT INTO platform_staff (user_id, role_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       role_id = excluded.role_id,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  )
    .bind(input.userId, input.roleId, input.status ?? 'active', ts, ts)
    .run();
}

export async function listPlatformStaff(): Promise<PlatformStaff[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT u.id AS user_id, u.email, u.name, ps.status, pr.key AS role_key, pr.name AS role_name
     FROM platform_staff ps
     JOIN user u ON u.id = ps.user_id
     JOIN platform_role pr ON pr.id = ps.role_id
     ORDER BY pr.key, u.email`,
  ).all<{
    user_id: string;
    email: string;
    name: string;
    status: string;
    role_key: string;
    role_name: string;
  }>();

  const out: PlatformStaff[] = [];
  for (const row of rows.results ?? []) {
    const staff = await loadPlatformStaff(row.user_id);
    if (staff) out.push(staff);
    else {
      out.push({
        userId: row.user_id,
        email: row.email,
        name: row.name,
        roleKey: row.role_key,
        roleName: row.role_name,
        status: row.status === 'active' ? 'active' : 'disabled',
        permissions: [],
      });
    }
  }
  return out;
}
