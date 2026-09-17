import { nowMs, randomToken } from './crypto';
import { getEnv } from './env';
import { PERMISSIONS, type Permission } from './permissions';
import { permissionPlainLanguage } from './role-plain-language';

export const SYSTEM_ROLE_KEYS = [
  'owner',
  'owner_view',
  'finance',
  'manager',
  'it',
  'clinician',
  'employee',
  'intern',
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

const SYSTEM_ROLE_KEY_SET = new Set<string>(SYSTEM_ROLE_KEYS);

const SYSTEM_SORT: Record<string, number> = {
  owner: 0,
  owner_view: 1,
  finance: 2,
  manager: 3,
  it: 4,
  clinician: 5,
  employee: 6,
  intern: 7,
};

export interface OrgRole {
  id: string;
  orgId: string;
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  sortOrder: number;
  permissions: Permission[];
}

export interface RoleUsageReport {
  people: number;
  peopleNames: string[];
  invites: number;
  trainingModules: Array<{ id: string; title: string }>;
  trainingLessons: Array<{ id: string; title: string; isAssignment: boolean }>;
  quickLinks: Array<{ id: string; name: string }>;
}

export function isSystemRoleKey(key: string): boolean {
  return SYSTEM_ROLE_KEY_SET.has(key);
}

export function slugifyRoleKey(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || `role_${randomToken(4)}`;
}

export function listAssignablePermissions(): Array<{ key: Permission; label: string }> {
  return PERMISSIONS.map((key) => ({
    key,
    label: permissionPlainLanguage[key] ?? key,
  }));
}

function normalizePermissionKeys(keys: string[]): Permission[] {
  const allowed = new Set<string>(PERMISSIONS);
  const out: Permission[] = [];
  for (const raw of keys) {
    const key = raw.trim() as Permission;
    if (!allowed.has(key)) continue;
    if (!out.includes(key)) out.push(key);
  }
  if (!out.includes('portal:access')) out.unshift('portal:access');
  return out;
}

async function copyPermissionsFromGlobalRole(globalRoleId: string, orgRoleId: string): Promise<void> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT p.key AS permission_key
     FROM role_permission rp
     JOIN permission p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
  )
    .bind(globalRoleId)
    .all<{ permission_key: string }>();

  const keys = normalizePermissionKeys((rows.results ?? []).map((row) => row.permission_key));
  if (keys.length === 0) return;
  await DB.batch(
    keys.map((key) =>
      DB.prepare(
        `INSERT OR IGNORE INTO organization_role_permission (role_id, permission_key) VALUES (?, ?)`,
      ).bind(orgRoleId, key),
    ),
  );
}

async function setOrgRolePermissions(roleId: string, permissions: Permission[]): Promise<void> {
  const { DB } = getEnv();
  const keys = normalizePermissionKeys(permissions);
  await DB.prepare(`DELETE FROM organization_role_permission WHERE role_id = ?`).bind(roleId).run();
  if (keys.length === 0) return;
  await DB.batch(
    keys.map((key) =>
      DB.prepare(
        `INSERT INTO organization_role_permission (role_id, permission_key) VALUES (?, ?)`,
      ).bind(roleId, key),
    ),
  );
}

/** Seed default Woven Sage roles for an org and remap user/invite role ids onto org copies. */
export async function ensureOrganizationRoles(orgId: string): Promise<OrgRole[]> {
  const { DB } = getEnv();
  const ts = nowMs();

  let existingCount = 0;
  try {
    const countRow = await DB.prepare(
      `SELECT COUNT(*) AS n FROM organization_role WHERE org_id = ?`,
    )
      .bind(orgId)
      .first<{ n: number }>();
    existingCount = Number(countRow?.n ?? 0);
  } catch {
    // Table not migrated yet.
    return [];
  }

  if (existingCount < SYSTEM_ROLE_KEYS.length) {
    const globalRoles = await DB.prepare(
      `SELECT id, key, name, description FROM role WHERE key IN (${SYSTEM_ROLE_KEYS.map(() => '?').join(',')})`,
    )
      .bind(...SYSTEM_ROLE_KEYS)
      .all<{ id: string; key: string; name: string; description: string }>();

    for (const global of globalRoles.results ?? []) {
      const existing = await DB.prepare(
        `SELECT id FROM organization_role WHERE org_id = ? AND key = ?`,
      )
        .bind(orgId, global.key)
        .first<{ id: string }>();

      if (existing) {
        const permCount = await DB.prepare(
          `SELECT COUNT(*) AS n FROM organization_role_permission WHERE role_id = ?`,
        )
          .bind(existing.id)
          .first<{ n: number }>();
        if (Number(permCount?.n ?? 0) === 0) {
          await copyPermissionsFromGlobalRole(global.id, existing.id);
        }
        continue;
      }

      const id = `orole_${orgId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}_${global.key}`.slice(0, 64);
      await DB.prepare(
        `INSERT INTO organization_role
           (id, org_id, key, name, description, is_system, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
        .bind(
          id,
          orgId,
          global.key,
          global.name,
          global.description,
          SYSTEM_SORT[global.key] ?? 50,
          ts,
          ts,
        )
        .run();
      await copyPermissionsFromGlobalRole(global.id, id);
    }
  }

  await remapAssignmentsToOrgRoles(orgId);
  return listOrganizationRoles(orgId);
}

async function remapAssignmentsToOrgRoles(orgId: string): Promise<void> {
  const { DB } = getEnv();

  // People in this org still pointing at global role ids.
  const people = await DB.prepare(
    `SELECT ur.user_id, ur.role_id AS old_role_id, r.key AS role_key, orole.id AS new_role_id
     FROM organization_member om
     JOIN user_role ur ON ur.user_id = om.user_id
     JOIN role r ON r.id = ur.role_id
     JOIN organization_role orole ON orole.org_id = om.org_id AND orole.key = r.key
     WHERE om.org_id = ?`,
  )
    .bind(orgId)
    .all<{ user_id: string; old_role_id: string; role_key: string; new_role_id: string }>();

  const peopleUpdates = (people.results ?? []).filter((row) => row.old_role_id !== row.new_role_id);
  if (peopleUpdates.length > 0) {
    await DB.batch(
      peopleUpdates.map((row) =>
        DB.prepare(`UPDATE user_role SET role_id = ? WHERE user_id = ? AND role_id = ?`).bind(
          row.new_role_id,
          row.user_id,
          row.old_role_id,
        ),
      ),
    );
  }

  const invites = await DB.prepare(
    `SELECT i.id, i.role_id AS old_role_id, r.key AS role_key, orole.id AS new_role_id
     FROM invitation i
     JOIN role r ON r.id = i.role_id
     JOIN organization_role orole ON orole.org_id = ? AND orole.key = r.key
     WHERE i.org_id = ? AND i.status = 'pending'`,
  )
    .bind(orgId, orgId)
    .all<{ id: string; old_role_id: string; new_role_id: string }>();

  const inviteUpdates = (invites.results ?? []).filter((row) => row.old_role_id !== row.new_role_id);
  if (inviteUpdates.length > 0) {
    await DB.batch(
      inviteUpdates.map((row) =>
        DB.prepare(`UPDATE invitation SET role_id = ? WHERE id = ?`).bind(row.new_role_id, row.id),
      ),
    );
  }
}

export async function listOrganizationRoles(orgId: string): Promise<OrgRole[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, org_id, key, name, description, is_system, sort_order
     FROM organization_role
     WHERE org_id = ?
     ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
  )
    .bind(orgId)
    .all<{
      id: string;
      org_id: string;
      key: string;
      name: string;
      description: string;
      is_system: number;
      sort_order: number;
    }>();

  const out: OrgRole[] = [];
  for (const row of rows.results ?? []) {
    const perms = await DB.prepare(
      `SELECT permission_key FROM organization_role_permission WHERE role_id = ? ORDER BY permission_key`,
    )
      .bind(row.id)
      .all<{ permission_key: string }>();
    out.push({
      id: row.id,
      orgId: row.org_id,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.is_system === 1,
      sortOrder: row.sort_order,
      permissions: (perms.results ?? [])
        .map((p) => p.permission_key)
        .filter((key): key is Permission => (PERMISSIONS as readonly string[]).includes(key)),
    });
  }
  return out;
}

export async function listOrganizationRolesWithPermissions(orgId: string) {
  const roles = await ensureOrganizationRoles(orgId);
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((key) => ({
      key,
      description: permissionPlainLanguage[key] ?? key,
    })),
  }));
}

export async function getOrganizationRole(orgId: string, roleId: string): Promise<OrgRole | null> {
  const roles = await listOrganizationRoles(orgId);
  return roles.find((role) => role.id === roleId) ?? null;
}

export async function createOrganizationRole(input: {
  orgId: string;
  name: string;
  description?: string;
  permissions: string[];
}): Promise<OrgRole> {
  await ensureOrganizationRoles(input.orgId);
  const name = input.name.trim();
  if (!name) throw new Error('Enter a role name.');
  if (name.length > 80) throw new Error('Role name is too long.');

  let key = slugifyRoleKey(name);
  if (isSystemRoleKey(key)) key = `${key}_custom`;

  const { DB } = getEnv();
  const clash = await DB.prepare(
    `SELECT id FROM organization_role WHERE org_id = ? AND key = ?`,
  )
    .bind(input.orgId, key)
    .first();
  if (clash) {
    key = `${key}_${randomToken(3)}`;
  }

  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 50) AS n FROM organization_role WHERE org_id = ?`,
  )
    .bind(input.orgId)
    .first<{ n: number }>();
  const id = randomToken(16);
  const ts = nowMs();
  const description = (input.description ?? '').trim();

  await DB.prepare(
    `INSERT INTO organization_role
       (id, org_id, key, name, description, is_system, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(id, input.orgId, key, name, description, Number(maxSort?.n ?? 50) + 1, ts, ts)
    .run();

  await setOrgRolePermissions(id, normalizePermissionKeys(input.permissions));
  const created = await getOrganizationRole(input.orgId, id);
  if (!created) throw new Error('Could not create role.');
  return created;
}

export async function updateOrganizationRole(input: {
  orgId: string;
  roleId: string;
  name?: string;
  description?: string;
  permissions?: string[];
}): Promise<void> {
  const existing = await getOrganizationRole(input.orgId, input.roleId);
  if (!existing) throw new Error('Role not found.');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new Error('Enter a role name.');
  if (name.length > 80) throw new Error('Role name is too long.');
  const description =
    input.description !== undefined ? input.description.trim() : existing.description;

  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE organization_role
     SET name = ?, description = ?, updated_at = ?
     WHERE id = ? AND org_id = ?`,
  )
    .bind(name, description, nowMs(), input.roleId, input.orgId)
    .run();

  if (input.permissions !== undefined) {
    if (existing.isSystem) {
      throw new Error('System role permissions cannot be changed.');
    }
    await setOrgRolePermissions(input.roleId, normalizePermissionKeys(input.permissions));
  }
}

export async function findRoleUsage(orgId: string, roleKey: string): Promise<RoleUsageReport> {
  const { DB } = getEnv();
  const role = await DB.prepare(
    `SELECT id FROM organization_role WHERE org_id = ? AND key = ?`,
  )
    .bind(orgId, roleKey)
    .first<{ id: string }>();

  const peopleRows = role
    ? await DB.prepare(
        `SELECT u.name
         FROM user_role ur
         JOIN organization_member om ON om.user_id = ur.user_id AND om.org_id = ?
         JOIN user u ON u.id = ur.user_id
         WHERE ur.role_id = ?
         ORDER BY u.name COLLATE NOCASE
         LIMIT 20`,
      )
        .bind(orgId, role.id)
        .all<{ name: string }>()
    : { results: [] as { name: string }[] };

  const peopleCount = role
    ? await DB.prepare(
        `SELECT COUNT(*) AS n
         FROM user_role ur
         JOIN organization_member om ON om.user_id = ur.user_id AND om.org_id = ?
         WHERE ur.role_id = ?`,
      )
        .bind(orgId, role.id)
        .first<{ n: number }>()
    : { n: 0 };

  const inviteCount = role
    ? await DB.prepare(
        `SELECT COUNT(*) AS n FROM invitation
         WHERE org_id = ? AND role_id = ? AND status = 'pending'`,
      )
        .bind(orgId, role.id)
        .first<{ n: number }>()
    : { n: 0 };

  const modules = await DB.prepare(
    `SELECT m.id, m.title
     FROM training_module_role tmr
     JOIN training_module m ON m.id = tmr.module_id
     WHERE m.org_id = ? AND tmr.role_key = ?
     ORDER BY m.title COLLATE NOCASE
     LIMIT 30`,
  )
    .bind(orgId, roleKey)
    .all<{ id: string; title: string }>();

  const lessons = await DB.prepare(
    `SELECT l.id, l.title, l.is_assignment
     FROM training_lesson_role tlr
     JOIN training_lesson l ON l.id = tlr.lesson_id
     JOIN training_module m ON m.id = l.module_id
     WHERE m.org_id = ? AND tlr.role_key = ?
     ORDER BY l.title COLLATE NOCASE
     LIMIT 30`,
  )
    .bind(orgId, roleKey)
    .all<{ id: string; title: string; is_assignment: number }>();

  const links = await DB.prepare(
    `SELECT ql.id, ql.name
     FROM portal_quick_link_role qlr
     JOIN portal_quick_link ql ON ql.id = qlr.link_id
     WHERE ql.org_id = ? AND qlr.role_key = ?
     ORDER BY ql.name COLLATE NOCASE
     LIMIT 30`,
  )
    .bind(orgId, roleKey)
    .all<{ id: string; name: string }>();

  return {
    people: Number(peopleCount?.n ?? 0),
    peopleNames: (peopleRows.results ?? []).map((row) => row.name),
    invites: Number(inviteCount?.n ?? 0),
    trainingModules: (modules.results ?? []).map((row) => ({ id: row.id, title: row.title })),
    trainingLessons: (lessons.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      isAssignment: row.is_assignment === 1,
    })),
    quickLinks: (links.results ?? []).map((row) => ({ id: row.id, name: row.name })),
  };
}

export function roleUsageIsEmpty(usage: RoleUsageReport): boolean {
  return (
    usage.people === 0 &&
    usage.invites === 0 &&
    usage.trainingModules.length === 0 &&
    usage.trainingLessons.length === 0 &&
    usage.quickLinks.length === 0
  );
}

export async function deleteOrganizationRole(orgId: string, roleId: string): Promise<void> {
  const existing = await getOrganizationRole(orgId, roleId);
  if (!existing) throw new Error('Role not found.');
  if (existing.isSystem || isSystemRoleKey(existing.key)) {
    throw new Error('System roles cannot be deleted.');
  }
  const usage = await findRoleUsage(orgId, existing.key);
  if (!roleUsageIsEmpty(usage)) {
    throw new Error('ROLE_IN_USE');
  }
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM organization_role WHERE id = ? AND org_id = ?`)
    .bind(roleId, orgId)
    .run();
}

export const NEW_ROLE_ASSIGNMENT_SURFACES = [
  'People (invite or change someone’s role)',
  'Training modules and lessons (role visibility checkboxes)',
  'Quick links (Visible to roles checkboxes)',
] as const;
