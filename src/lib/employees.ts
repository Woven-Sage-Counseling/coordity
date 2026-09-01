import { getEnv } from './env';
import { nowMs } from './crypto';
import { writeAuditLog } from './audit';
import type { Auth } from './auth';

export const DIRECTORY_TEAMS = [
  { id: 'team_owners', key: 'owners', name: 'Owners' },
  { id: 'team_management', key: 'management', name: 'Management' },
  { id: 'team_financial', key: 'financial', name: 'Financial' },
  { id: 'team_marketing', key: 'marketing', name: 'Marketing' },
  { id: 'team_clinical', key: 'clinical', name: 'Clinical' },
] as const;

export const CLINICAL_TEAM_NAME =
  DIRECTORY_TEAMS.find((team) => team.id === 'team_clinical')?.name ?? 'Clinical';

/** Active clinicians by role or Clinical team membership (matches directory credentialing). */
export function isClinicianEmployee(employee: PortalEmployee | null): boolean {
  if (!employee || employee.status !== 'active') return false;
  return employee.roles.includes('clinician') || employee.teams.includes(CLINICAL_TEAM_NAME);
}

export type DirectoryTeamId = (typeof DIRECTORY_TEAMS)[number]['id'];

export interface DirectoryPerson {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
  teams: string[];
  hasAvatar: boolean;
}

async function teamsByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;

  const { DB } = getEnv();
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await DB.prepare(
    `SELECT ut.user_id, t.name
     FROM user_team ut
     JOIN directory_team t ON t.id = ut.team_id
     WHERE ut.user_id IN (${placeholders})
     ORDER BY t.sort_order`,
  )
    .bind(...userIds)
    .all<{ user_id: string; name: string }>();

  for (const row of rows.results ?? []) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.name);
    map.set(row.user_id, list);
  }
  return map;
}

async function teamIdsByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;

  const { DB } = getEnv();
  const placeholders = userIds.map(() => '?').join(', ');
  const rows = await DB.prepare(
    `SELECT ut.user_id, ut.team_id
     FROM user_team ut
     JOIN directory_team t ON t.id = ut.team_id
     WHERE ut.user_id IN (${placeholders})
     ORDER BY t.sort_order`,
  )
    .bind(...userIds)
    .all<{ user_id: string; team_id: string }>();

  for (const row of rows.results ?? []) {
    const list = map.get(row.user_id) ?? [];
    list.push(row.team_id);
    map.set(row.user_id, list);
  }
  return map;
}

export async function listEmployees() {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        u.id,
        u.email,
        u.name,
        COALESCE(p.status, 'pending') AS status,
        p.job_title AS jobTitle,
        p.phone,
        GROUP_CONCAT(r.key) AS roles
     FROM user u
     LEFT JOIN employee_profile p ON p.user_id = u.id
     LEFT JOIN user_role ur ON ur.user_id = u.id
     LEFT JOIN role r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.name COLLATE NOCASE, u.email`,
  ).all<{
    id: string;
    email: string;
    name: string;
    status: string;
    jobTitle: string | null;
    phone: string | null;
    roles: string | null;
  }>();

  const people = rows.results ?? [];
  const teamIds = await teamIdsByUser(people.map((row) => row.id));

  return people.map((row) => ({
    ...row,
    roles: row.roles ? row.roles.split(',') : [],
    teamIds: teamIds.get(row.id) ?? [],
  }));
}

export async function listDirectory(): Promise<DirectoryPerson[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        u.id,
        u.name,
        u.email,
        p.job_title AS jobTitle,
        p.phone,
        CASE WHEN p.avatar_data IS NOT NULL AND p.avatar_data != '' THEN 1 ELSE 0 END AS hasAvatar
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     WHERE p.status = 'active'
     ORDER BY u.name COLLATE NOCASE, u.email`,
  ).all<{
    id: string;
    name: string;
    email: string;
    jobTitle: string | null;
    phone: string | null;
    hasAvatar: number;
  }>();

  const people = rows.results ?? [];
  const teams = await teamsByUser(people.map((row) => row.id));

  return people.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    phone: row.phone,
    hasAvatar: row.hasAvatar === 1,
    teams: teams.get(row.id) ?? [],
  }));
}

/** Active directory people who are clinicians by role or Clinical team membership. */
export async function listDirectoryClinicians(): Promise<DirectoryPerson[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        u.id,
        u.name,
        u.email,
        p.job_title AS jobTitle,
        p.phone,
        CASE WHEN p.avatar_data IS NOT NULL AND p.avatar_data != '' THEN 1 ELSE 0 END AS hasAvatar
     FROM user u
     JOIN employee_profile p ON p.user_id = u.id
     WHERE p.status = 'active'
       AND (
         EXISTS (
           SELECT 1
           FROM user_role ur
           JOIN role r ON r.id = ur.role_id
           WHERE ur.user_id = u.id AND r.key = 'clinician'
         )
         OR EXISTS (
           SELECT 1
           FROM user_team ut
           WHERE ut.user_id = u.id AND ut.team_id = 'team_clinical'
         )
       )
     ORDER BY u.name COLLATE NOCASE, u.email`,
  ).all<{
    id: string;
    name: string;
    email: string;
    jobTitle: string | null;
    phone: string | null;
    hasAvatar: number;
  }>();

  const people = rows.results ?? [];
  const teams = await teamsByUser(people.map((row) => row.id));

  return people.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.jobTitle,
    phone: row.phone,
    hasAvatar: row.hasAvatar === 1,
    teams: teams.get(row.id) ?? [],
  }));
}

export function groupDirectoryByTeam(people: DirectoryPerson[]) {
  const groups = DIRECTORY_TEAMS.map((team) => ({
    id: team.id,
    name: team.name,
    people: people.filter((person) => person.teams.includes(team.name)),
  }));
  const unassigned = people.filter((person) => person.teams.length === 0);
  return { groups, unassigned };
}

export async function listRoles() {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, key, name, description FROM role
     ORDER BY CASE key
       WHEN 'owner' THEN 0
       WHEN 'owner_view' THEN 1
       WHEN 'finance' THEN 2
       WHEN 'manager' THEN 3
       WHEN 'it' THEN 4
       WHEN 'clinician' THEN 5
       WHEN 'employee' THEN 6
       WHEN 'intern' THEN 7
       ELSE 8
     END`,
  ).all<{
    id: string;
    key: string;
    name: string;
    description: string;
  }>();
  return rows.results ?? [];
}

export async function listRolesWithPermissions() {
  const roles = await listRoles();
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT r.key AS role_key, perm.key AS permission_key, perm.description AS permission_description
     FROM role r
     LEFT JOIN role_permission rp ON rp.role_id = r.id
     LEFT JOIN permission perm ON perm.id = rp.permission_id
     ORDER BY r.key, perm.key`,
  ).all<{
    role_key: string;
    permission_key: string | null;
    permission_description: string | null;
  }>();

  const byRole = new Map<string, { key: string; description: string }[]>();
  for (const row of rows.results ?? []) {
    if (!row.permission_key) continue;
    const list = byRole.get(row.role_key) ?? [];
    list.push({ key: row.permission_key, description: row.permission_description ?? row.permission_key });
    byRole.set(row.role_key, list);
  }

  return roles.map((role) => ({
    ...role,
    permissions: byRole.get(role.key) ?? [],
  }));
}

export async function updateDisplayName(input: {
  userId: string;
  name: string;
  actorUserId: string;
}): Promise<void> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error('Name must be between 2 and 80 characters.');
  }

  const { DB } = getEnv();
  await DB.prepare(`UPDATE user SET name = ? WHERE id = ?`).bind(name, input.userId).run();
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.name_changed',
    targetType: 'user',
    targetId: input.userId,
    metadata: { name },
  });
}

export async function updateDirectoryProfile(input: {
  userId: string;
  name?: string;
  phone?: string;
  actorUserId: string;
}): Promise<void> {
  const { DB } = getEnv();
  const ts = nowMs();
  const updates: string[] = [];
  const values: Array<string | number | null> = [];
  const metadata: Record<string, string | null> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 80) {
      throw new Error('Name must be between 2 and 80 characters.');
    }
    await DB.prepare(`UPDATE user SET name = ? WHERE id = ?`).bind(name, input.userId).run();
    metadata.name = name;
  }

  if (input.phone !== undefined) {
    const phone = formatPhoneNumber(input.phone);
    updates.push('phone = ?');
    values.push(phone);
    metadata.phone = phone;
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(ts, input.userId);
    await DB.prepare(
      `UPDATE employee_profile
       SET ${updates.join(', ')}
       WHERE user_id = ?`,
    )
      .bind(...values)
      .run();
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.profile_updated',
    targetType: 'user',
    targetId: input.userId,
    metadata,
  });
}

/** Normalize to (XXX) XXX-XXXX when possible; blank clears the field. */
export function formatPhoneNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  let national = digits;
  if (national.length === 11 && national.startsWith('1')) {
    national = national.slice(1);
  }

  if (national.length !== 10) {
    throw new Error('Enter a 10-digit US phone number.');
  }

  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

export async function updateEmployeeAvatar(input: {
  userId: string;
  mime: string;
  dataBase64: string;
  actorUserId: string;
}): Promise<void> {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowed.has(input.mime)) {
    throw new Error('Profile photos must be JPEG, PNG, or WebP.');
  }
  if (input.dataBase64.length > 350_000) {
    throw new Error('Profile photo is too large. Try a smaller image.');
  }

  const { DB } = getEnv();
  const result = await DB.prepare(
    `UPDATE employee_profile
     SET avatar_mime = ?, avatar_data = ?, avatar_updated_at = ?, updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(input.mime, input.dataBase64, nowMs(), nowMs(), input.userId)
    .run();

  if (!result.meta.changes) {
    throw new Error('Employee profile not found.');
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.avatar_updated',
    targetType: 'user',
    targetId: input.userId,
  });
}

export async function clearEmployeeAvatar(input: {
  userId: string;
  actorUserId: string;
}): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `UPDATE employee_profile
     SET avatar_mime = NULL, avatar_data = NULL, avatar_updated_at = NULL, updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(nowMs(), input.userId)
    .run();

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.avatar_removed',
    targetType: 'user',
    targetId: input.userId,
  });
}

export async function getEmployeeAvatar(userId: string): Promise<{ mime: string; dataBase64: string } | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT avatar_mime, avatar_data
     FROM employee_profile
     WHERE user_id = ? AND avatar_data IS NOT NULL AND avatar_data != ''`,
  )
    .bind(userId)
    .first<{ avatar_mime: string | null; avatar_data: string }>();

  if (!row?.avatar_data || !row.avatar_mime) return null;
  return { mime: row.avatar_mime, dataBase64: row.avatar_data };
}

export async function updateEmployeeJobTitle(input: {
  userId: string;
  jobTitle: string;
  actorUserId: string;
}): Promise<void> {
  const jobTitle = input.jobTitle.trim();
  if (jobTitle.length > 80) {
    throw new Error('Job title must be 80 characters or fewer.');
  }

  const { DB } = getEnv();
  const result = await DB.prepare(
    `UPDATE employee_profile
     SET job_title = ?, updated_at = ?
     WHERE user_id = ?`,
  )
    .bind(jobTitle || null, nowMs(), input.userId)
    .run();

  if (!result.meta.changes) {
    throw new Error('Employee profile not found.');
  }

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.job_title_changed',
    targetType: 'user',
    targetId: input.userId,
    metadata: { jobTitle: jobTitle || null },
  });
}

export async function updateEmployeeTeams(input: {
  userId: string;
  teamIds: string[];
  actorUserId: string;
}): Promise<void> {
  const allowed = new Set<string>(DIRECTORY_TEAMS.map((team) => team.id));
  const teamIds = Array.from(new Set(input.teamIds.filter((id) => allowed.has(id))));
  const { DB } = getEnv();
  const now = nowMs();

  const profile = await DB.prepare(`SELECT user_id FROM employee_profile WHERE user_id = ?`)
    .bind(input.userId)
    .first();
  if (!profile) {
    throw new Error('Employee profile not found.');
  }

  const statements = [
    DB.prepare(`DELETE FROM user_team WHERE user_id = ?`).bind(input.userId),
    ...teamIds.map((teamId) =>
      DB.prepare(`INSERT INTO user_team (user_id, team_id) VALUES (?, ?)`).bind(input.userId, teamId),
    ),
  ];
  await DB.batch(statements);

  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: 'employee.teams_changed',
    targetType: 'user',
    targetId: input.userId,
    metadata: { teamIds, at: now },
  });
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

export function assignableRoles<T extends { id: string; key: string }>(
  roles: T[],
  options?: { includePrimaryOwner?: boolean },
): T[] {
  if (options?.includePrimaryOwner) return roles;
  return roles.filter((role) => role.key !== 'owner');
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
