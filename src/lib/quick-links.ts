import {
  appCategories,
  getCatalogItem,
  type PortalApp,
  type PortalAppCategory,
} from './apps';
import { nowMs, randomToken } from './crypto';
import { getEnv } from './env';
import type { Permission } from './permissions';

export const QUICK_LINK_CATEGORIES = appCategories.map((c) => c.id);

export type QuickLinkCategory = PortalAppCategory;

export interface QuickLinkView {
  id: string;
  name: string;
  category: QuickLinkCategory;
  description: string;
  href: string;
  external: boolean;
  iconSrc?: string;
  catalogKey: string | null;
  enabled: boolean;
  /** Empty = visible to every role. */
  roleKeys: string[];
  sortOrder: number;
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

async function listLinkRoleKeys(linkId: string): Promise<string[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT role_key FROM portal_quick_link_role WHERE link_id = ? ORDER BY role_key`,
  )
    .bind(linkId)
    .all<{ role_key: string }>();
  return (rows.results ?? []).map((row) => row.role_key);
}

async function setLinkRoleKeys(linkId: string, roleKeys: string[]): Promise<void> {
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

type QuickLinkRow = {
  id: string;
  name: string;
  href: string;
  description: string;
  category: string;
  icon_src: string | null;
  catalog_key: string | null;
  sort_order: number;
  enabled: number;
};

function mapRow(row: QuickLinkRow, roleKeys: string[]): QuickLinkView {
  return {
    id: row.id,
    name: row.name,
    category: normalizeCategory(row.category),
    description: row.description,
    href: row.href,
    external: isHttpUrl(row.href),
    iconSrc: row.icon_src ?? undefined,
    catalogKey: row.catalog_key,
    enabled: row.enabled === 1,
    roleKeys,
    sortOrder: row.sort_order,
  };
}

async function selectLinkRows(orgId: string): Promise<QuickLinkRow[]> {
  const { DB } = getEnv();
  try {
    const rows = await DB.prepare(
      `SELECT id, name, href, description, category, icon_src, catalog_key, sort_order, enabled
       FROM portal_quick_link
       WHERE org_id = ?
       ORDER BY sort_order ASC, name ASC`,
    )
      .bind(orgId)
      .all<QuickLinkRow>();
    return rows.results ?? [];
  } catch {
    // Before migration 0057 (catalog_key column).
    const rows = await DB.prepare(
      `SELECT id, name, href, description, category, icon_src, sort_order, enabled
       FROM portal_quick_link
       WHERE org_id = ?
       ORDER BY sort_order ASC, name ASC`,
    )
      .bind(orgId)
      .all<Omit<QuickLinkRow, 'catalog_key'>>();
    return (rows.results ?? []).map((row) => ({ ...row, catalog_key: null }));
  }
}

export async function listQuickLinksForAdmin(orgId: string): Promise<QuickLinkView[]> {
  const rows = await selectLinkRows(orgId);
  const out: QuickLinkView[] = [];
  for (const row of rows) {
    out.push(mapRow(row, await listLinkRoleKeys(row.id)));
  }
  return out;
}

export async function listVisibleQuickLinks(input: {
  orgId: string;
  roleKeys: string[];
}): Promise<QuickLinkView[]> {
  const all = await listQuickLinksForAdmin(input.orgId);
  return all.filter((link) => link.enabled && visibleToRoles(link.roleKeys, input.roleKeys));
}

export async function createQuickLink(input: {
  orgId: string;
  name: string;
  href: string;
  description?: string;
  category: QuickLinkCategory;
  iconSrc?: string | null;
  catalogKey?: string | null;
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
  const catalogKey = input.catalogKey?.trim() || null;

  const { DB } = getEnv();
  if (catalogKey) {
    const existing = await DB.prepare(
      `SELECT id FROM portal_quick_link WHERE org_id = ? AND catalog_key = ?`,
    )
      .bind(input.orgId, catalogKey)
      .first<{ id: string }>();
    if (existing) throw new Error('That tool is already on your Quick links.');
  }

  const ts = nowMs();
  const id = randomToken(16);
  const maxSort = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS n FROM portal_quick_link WHERE org_id = ?`,
  )
    .bind(input.orgId)
    .first<{ n: number }>();
  const sortOrder = Number(maxSort?.n ?? -1) + 1;

  try {
    await DB.prepare(
      `INSERT INTO portal_quick_link
         (id, org_id, name, href, description, category, icon_src, catalog_key, sort_order, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        input.orgId,
        name,
        href,
        (input.description ?? '').trim(),
        input.category,
        iconSrc,
        catalogKey,
        sortOrder,
        input.enabled === false ? 0 : 1,
        ts,
        ts,
      )
      .run();
  } catch {
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
  }

  await setLinkRoleKeys(id, input.roleKeys ?? []);

  return {
    id,
    name,
    category: input.category,
    description: (input.description ?? '').trim(),
    href,
    external: true,
    iconSrc: iconSrc ?? undefined,
    catalogKey,
    enabled: input.enabled !== false,
    roleKeys: input.roleKeys ?? [],
    sortOrder,
  };
}

export async function addQuickLinkFromCatalog(input: {
  orgId: string;
  catalogKey: string;
  roleKeys?: string[];
}): Promise<QuickLinkView> {
  const item = getCatalogItem(input.catalogKey);
  if (!item) throw new Error('Unknown catalog tool.');

  let roleKeys = input.roleKeys;
  if (roleKeys === undefined) {
    roleKeys = await listRoleKeysWithPermission(item.suggestedPermission);
  }

  return createQuickLink({
    orgId: input.orgId,
    name: item.name,
    href: item.href,
    description: item.description,
    category: item.category,
    iconSrc: item.iconSrc ?? null,
    catalogKey: item.key,
    roleKeys,
    enabled: true,
  });
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
    await setLinkRoleKeys(input.linkId, input.roleKeys);
  }
}

export async function deleteQuickLink(orgId: string, linkId: string): Promise<void> {
  const { DB } = getEnv();
  const result = await DB.prepare(`DELETE FROM portal_quick_link WHERE id = ? AND org_id = ?`)
    .bind(linkId, orgId)
    .run();
  if (!Number(result.meta.changes ?? 0)) throw new Error('Quick link not found.');
}

export function toPortalApp(link: QuickLinkView): PortalApp {
  return {
    id: link.id,
    name: link.name,
    category: link.category,
    description: link.description,
    href: link.href,
    external: link.external,
    permission: 'portal:access',
    iconSrc: link.iconSrc,
  };
}
