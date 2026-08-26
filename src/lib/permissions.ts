import { getEnv } from './env';

export const PERMISSIONS = [
  'portal:access',
  'account:view',
  'resources:view',
  'resources:manage',
  'apps:clinical',
  'apps:management',
  'financials:view',
  'financials:manage',
  'employees:view',
  'employees:manage',
  'credentialing:view',
  'credentialing:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export async function loadEmployee(userId: string): Promise<PortalEmployee | null> {
  const { DB } = getEnv();

  const profile = await DB.prepare(
    `SELECT
        u.id,
        u.email,
        u.name,
        COALESCE(p.status, 'pending') AS status,
        p.job_title,
        p.phone,
        CASE WHEN p.avatar_data IS NOT NULL AND p.avatar_data != '' THEN 1 ELSE 0 END AS has_avatar
     FROM user u
     LEFT JOIN employee_profile p ON p.user_id = u.id
     WHERE u.id = ?`,
  )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      name: string;
      status: PortalEmployee['status'];
      job_title: string | null;
      phone: string | null;
      has_avatar: number;
    }>();

  if (!profile) return null;

  const roles = await DB.prepare(
    `SELECT r.key
     FROM user_role ur
     JOIN role r ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
  )
    .bind(userId)
    .all<{ key: string }>();

  const teams = await DB.prepare(
    `SELECT t.name
     FROM user_team ut
     JOIN directory_team t ON t.id = ut.team_id
     WHERE ut.user_id = ?
     ORDER BY t.sort_order`,
  )
    .bind(userId)
    .all<{ name: string }>();

  const permissions =
    profile.status === 'active'
      ? await DB.prepare(
          `SELECT DISTINCT perm.key
           FROM user_role ur
           JOIN role_permission rp ON rp.role_id = ur.role_id
           JOIN permission perm ON perm.id = rp.permission_id
           WHERE ur.user_id = ?`,
        )
          .bind(userId)
          .all<{ key: Permission }>()
      : { results: [] as { key: Permission }[] };

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    jobTitle: profile.job_title,
    phone: profile.phone,
    teams: (teams.results ?? []).map((row) => row.name),
    hasAvatar: profile.has_avatar === 1,
    status: isOwnerEmail(profile.email) ? 'active' : profile.status,
    roles: isOwnerEmail(profile.email)
      ? Array.from(new Set(['owner', ...(roles.results ?? []).map((row) => row.key)]))
      : (roles.results ?? []).map((row) => row.key),
    permissions: isOwnerEmail(profile.email)
      ? [...PERMISSIONS]
      : (permissions.results ?? []).map((row) => row.key),
  };
}

export function isOwnerEmail(email: string): boolean {
  const owner = (getEnv().PORTAL_OWNER_EMAIL ?? '').trim().toLowerCase();
  return Boolean(owner) && email.trim().toLowerCase() === owner;
}

/** Primary owner and Owner (view) roles — admin tab and announcements. */
export function canAccessManagement(employee: PortalEmployee | null): boolean {
  if (!employee || employee.status !== 'active') return false;
  if (isOwnerEmail(employee.email)) return true;
  return employee.roles.includes('owner') || employee.roles.includes('owner_view');
}

export function hasPermission(employee: PortalEmployee | null, permission: Permission): boolean {
  if (!employee || employee.status !== 'active') return false;
  return employee.permissions.includes(permission);
}

export function requirePermission(employee: PortalEmployee | null, permission: Permission): boolean {
  return hasPermission(employee, permission);
}
