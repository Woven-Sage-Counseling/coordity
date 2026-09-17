import { appCategories, portalApps, type PortalApp } from './apps';
import { nowMs, randomToken } from './crypto';
import { getEnv } from './env';
import type { Permission } from './permissions';

export const QUICK_LINK_CATEGORIES = appCategories.map((c) => c.id);

export type QuickLinkCategory = PortalApp['category'];

export interface QuickLinkView {
  id: string;
  name: string;
  category: QuickLinkCategory;
  description: string;
  href: string;
  external: boolean;
  iconSrc?: string;
  source: 'builtin' | 'custom';
  enabled: boolean;
  /** Empty = visible to every role. */
  roleKeys: string[];
  /** When false for builtins, visibility still uses the app permission until roles are saved. */
  rolesConfigured: boolean;
  sortOrder: number;
  permission?: Permission;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isAllowedIconSrc(value: string | null | undefined): value is string {
  if (!value) return false;
  if (value.startsWith('/app-icons/')) return true;
  return isHttpUrl(value);
}

function normalizeCategory(raw: string): QuickLinkCategory {
  if (
    raw === 'clinical' ||
    raw === 'billing' ||
    raw === 'business' ||
    raw === 'financial' ||
    raw === 'internal'
  ) {
    return raw;
  }
  return 'business';
}

function visibleToRoles(roleKeys: string[], employeeRoles: string[]): boolean {
  if (roleKeys.length === 0) return true;
  return roleKeys.some((key) => employeeRoles.includes(key));
}

export async function listRoleKeysWithPermission(permission: Permission): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT r.key AS role_key
     FROM role r
     JOIN role_permission rp ON rp.role_id = r.id
     JOIN permission p ON p.id = rp.permission_id
     WHERE p.key = ?
     ORDER BY r.key`,
  )
    .bind(permission)
    .all<{ role_key: string }>();
  return (rows.results ?? []).map((row) => row.role_key);
}

async function listCustomRoleKeys(linkId: string): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT role_key FROM portal_quick_link_role WHERE link_id = ? ORDER BY role_key`,
  )
    .bind(linkId)
    .all<{ role_key: string }>();
  return (rows.results ?? []).map((row) => row.role_key);
}

async function setCustomRoleKeys(linkId: string, roleKeys: string[]): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(`DELETE FROM portal_quick_link_role WHERE link_id = ?`).bind(linkId).run();
  if (roleKeys.length === 0) return;
  await DB.batch(
    roleKeys.map((roleKey) =>
      DB.prepare(`INSERT INTO portal_quick_link_role (link_id, role_key) VALUES (?, ?)`).bind(
        linkId,
        roleKey,
      ),
    ),
  );
}

async function listBuiltinRoleKeys(orgId: string, appId: string): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT role_key FROM portal_builtin_app_role
     WHERE org_id = ? AND app_id = ?
     ORDER BY role_key`,
  )
    .bind(orgId, appId)
    .all<{ role_key: string }>();
  return (rows.results ?? []).map((row) => row.role_key);
}

async function ensureBuiltinSetting(orgId: string, appId: string): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO portal_builtin_app_setting (org_id, app_id, enabled, roles_configured, sort_order, updated_at)
     VALUES (?, ?, 1, 0, NULL, ?)
     ON CONFLICT(org_id, app_id) DO NOTHING`,
  )
    .bind(orgId, appId, nowMs())
    .run();
}

export async function listQuickLinksForAdmin(orgId: string): Promise<QuickLinkView[]> {
  const { DB } = getEnv();
  const builtinSettings = await DB.prepare(
    `SELECT app_id, enabled, roles_configured, sort_order
     FROM portal_builtin_app_setting
     WHERE org_id = ?`,
  )
    .bind(orgId)
    .all<{
      app_id: string;
      enabled: number;
      roles_configured: number;
      sort_order: number | null;
    }>();
  const settingByApp = new Map(
    (builtinSettings.results ?? []).map((row) => [
      row.app_id,
      {
        enabled: row.enabled === 1,
        rolesConfigured: row.roles_configured === 1,
        sortOrder: row.sort_order,
      },
    ]),
  );

  const builtins: QuickLinkView[] = [];
  for (let index = 0; index < portalApps.length; index += 1) {
    const app = portalApps[index]!;
    const setting = settingByApp.get(app.id);
    const rolesConfigured = setting?.rolesConfigured ?? false;
    const roleKeys = rolesConfigured
      ? await listBuiltinRoleKeys(orgId, app.id)
      : await listRoleKeysWithPermission(app.permission);
    builtins.push({
      id: app.id,
      name: app.name,
      category: app.category,
      description: app.description,
      href: app.href,
      external: app.external,
      iconSrc: app.iconSrc,
      source: 'builtin',
      enabled: setting?.enabled ?? true,
      roleKeys,
      rolesConfigured,
      sortOrder: setting?.sortOrder ?? index,
      permission: app.permission,
    });
  }

  const customRows = await DB.prepare(
    `SELECT id, name, href, description, category, icon_src, sort_order, enabled
     FROM portal_quick_link
     WHERE org_id = ?
     ORDER BY sort_order ASC, name ASC`,
  )
    .bind(orgId)
    .all<{
      id: string;
      name: string;
      href: string;
      description: string;
      category: string;
      icon_src: string | null;
      sort_order: number;
      enabled: number;
    }>();

  const customs: QuickLinkView[] = [];
  for (const row of customRows.results ?? []) {
    customs.push({
      id: row.id,
      name: row.name,
      category: normalizeCategory(row.category),
      description: row.description,
      href: row.href,
      external: isHttpUrl(row.href),
      iconSrc: row.icon_src ?? undefined,
      source: 'custom',
      enabled: row.enabled === 1,
      roleKeys: await listCustomRoleKeys(row.id),
      rolesConfigured: true,
      sortOrder: row.sort_order,
    });
  }

  return [...builtins, ...customs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export async function listVisibleQuickLinks(input: {
  orgId: string;
  roleKeys: string[];
  hasPermission: (permission: Permission) => boolean;
}): Promise<QuickLinkView[]> {
  const all = await listQuickLinksForAdmin(input.orgId);
  return all.filter((link) => {
    if (!link.enabled) return false;
    if (link.source === 'builtin' && !link.rolesConfigured) {
      return link.permission ? input.hasPermission(link.permission) : true;
    }
    return visibleToRoles(link.roleKeys, input.roleKeys);
  });
}

export async function createQuickLink(input: {
  orgId: string;
  name: string;
  href: string;
  description?: string;
  category: QuickLinkCategory;
  iconSrc?: string | null;
  roleKeys?: string[];
  enabled?: boolean;
}): Promise<QuickLinkView> {
  const name = input.name.trim();
  const href = input.href.trim();
  if (!name) throw new Error('Enter a name.');
  if (!href || !isHttpUrl(href)) throw new Error('Enter a valid http(s) URL.');
  const iconSrc = input.iconSrc?.trim() || null;
  if (iconSrc && !isAllowedIconSrc(iconSrc)) {
    throw new Error('Icon must be an https URL or an /app-icons/ path.');
  }

  const { DB } = getEnv();
  const ts = nowMs();
  const id = randomToken(16);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n FROM portal_quick_link WHERE org_id = ?`,
  )
    .bind(input.orgId)
    .first<{ n: number }>();
  const sortOrder = Number(maxSort?.n ?? -1) + 1;

  await DB.prepare(
    `INSERT INTO portal_quick_link
       (id, org_id, name, href, description, category, icon_src, sort_order, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.orgId,
      name,
      href,
      (input.description ?? '').trim(),
      input.category,
      iconSrc,
      sortOrder,
      input.enabled === false ? 0 : 1,
      ts,
      ts,
    )
    .run();

  await setCustomRoleKeys(id, input.roleKeys ?? []);

  return {
    id,
    name,
    category: input.category,
    description: (input.description ?? '').trim(),
    href,
    external: true,
    iconSrc: iconSrc ?? undefined,
    source: 'custom',
    enabled: input.enabled !== false,
    roleKeys: input.roleKeys ?? [],
    rolesConfigured: true,
    sortOrder,
  };
}

export async function updateQuickLink(input: {
  orgId: string;
  linkId: string;
  name?: string;
  href?: string;
  description?: string;
  category?: QuickLinkCategory;
  iconSrc?: string | null;
  roleKeys?: string[];
  enabled?: boolean;
  sortOrder?: number;
}): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT id, name, href, description, category, icon_src, sort_order, enabled
     FROM portal_quick_link WHERE id = ? AND org_id = ?`,
  )
    .bind(input.linkId, input.orgId)
    .first<{
      id: string;
      name: string;
      href: string;
      description: string;
      category: string;
      icon_src: string | null;
      sort_order: number;
      enabled: number;
    }>();
  if (!existing) throw new Error('Quick link not found.');

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const href = input.href !== undefined ? input.href.trim() : existing.href;
  if (!name) throw new Error('Enter a name.');
  if (!href || !isHttpUrl(href)) throw new Error('Enter a valid http(s) URL.');

  let iconSrc = existing.icon_src;
  if (input.iconSrc !== undefined) {
    const next = input.iconSrc?.trim() || null;
    if (next && !isAllowedIconSrc(next)) {
      throw new Error('Icon must be an https URL or an /app-icons/ path.');
    }
    iconSrc = next;
  }

  await DB.prepare(
    `UPDATE portal_quick_link
     SET name = ?, href = ?, description = ?, category = ?, icon_src = ?,
         sort_order = ?, enabled = ?, updated_at = ?
     WHERE id = ? AND org_id = ?`,
  )
    .bind(
      name,
      href,
      input.description !== undefined ? input.description.trim() : existing.description,
      input.category ?? normalizeCategory(existing.category),
      iconSrc,
      input.sortOrder ?? existing.sort_order,
      input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled,
      nowMs(),
      input.linkId,
      input.orgId,
    )
    .run();

  if (input.roleKeys !== undefined) {
    await setCustomRoleKeys(input.linkId, input.roleKeys);
  }
}

export async function deleteQuickLink(orgId: string, linkId: string): Promise<void> {
  const { DB } = getEnv();
  const result = await DB.prepare(`DELETE FROM portal_quick_link WHERE id = ? AND org_id = ?`)
    .bind(linkId, orgId)
    .run();
  if (!Number(result.meta.changes ?? 0)) throw new Error('Quick link not found.');
}

export async function updateBuiltinAppSetting(input: {
  orgId: string;
  appId: string;
  enabled?: boolean;
  roleKeys?: string[];
  sortOrder?: number | null;
}): Promise<void> {
  const app = portalApps.find((item) => item.id === input.appId);
  if (!app) throw new Error('Built-in app not found.');

  await ensureBuiltinSetting(input.orgId, input.appId);
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT enabled, roles_configured, sort_order
     FROM portal_builtin_app_setting
     WHERE org_id = ? AND app_id = ?`,
  )
    .bind(input.orgId, input.appId)
    .first<{ enabled: number; roles_configured: number; sort_order: number | null }>();

  const rolesConfigured =
    input.roleKeys !== undefined ? 1 : (existing?.roles_configured ?? 0);

  await DB.prepare(
    `UPDATE portal_builtin_app_setting
     SET enabled = ?, roles_configured = ?, sort_order = ?, updated_at = ?
     WHERE org_id = ? AND app_id = ?`,
  )
    .bind(
      input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing?.enabled ?? 1),
      rolesConfigured,
      input.sortOrder !== undefined ? input.sortOrder : (existing?.sort_order ?? null),
      nowMs(),
      input.orgId,
      input.appId,
    )
    .run();

  if (input.roleKeys !== undefined) {
    await DB.prepare(`DELETE FROM portal_builtin_app_role WHERE org_id = ? AND app_id = ?`)
      .bind(input.orgId, input.appId)
      .run();
    if (input.roleKeys.length > 0) {
      await DB.batch(
        input.roleKeys.map((roleKey) =>
          DB.prepare(
            `INSERT INTO portal_builtin_app_role (org_id, app_id, role_key) VALUES (?, ?, ?)`,
          ).bind(input.orgId, input.appId, roleKey),
        ),
      );
    }
  }
}

export function toPortalApp(link: QuickLinkView): PortalApp {
  return {
    id: link.id,
    name: link.name,
    category: link.category,
    description: link.description,
    href: link.href,
    external: link.external,
    permission: link.permission ?? 'portal:access',
    iconSrc: link.iconSrc,
  };
}
