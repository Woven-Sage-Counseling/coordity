import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';

/** Default org until host resolution supplies a tenant (local / legacy). */
export const DEFAULT_ORG_ID = 'org_wovensage';
export const DEFAULT_ORG_SLUG = 'wovensage';

export const COORDITY_PRODUCT_NAME = 'Coordity';
export const COORDITY_COLORS = {
  primaryBlue: '#005284',
  secondaryBlue: '#3B82F6',
  primaryYellow: '#FECB00',
  secondaryYellow: '#FFE066',
} as const;
export const COORDITY_APEX_HOSTS = new Set([
  'coordity.com',
  'www.coordity.com',
]);

export const COORDITY_SYSTEM_USER_ID = 'user_coordity_system';

const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'auth',
  'cdn',
  'coordity',
  'create',
  'docs',
  'embed',
  'ftp',
  'help',
  'login',
  'mail',
  'portal',
  'preview',
  'signup',
  'staging',
  'static',
  'status',
  'support',
  'wovensage',
]);

export function normalizeOrgSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function assertValidOrgSlug(slug: string): string {
  const normalized = normalizeOrgSlug(slug);
  if (normalized.length < 3) {
    throw new Error('Workspace URL must be at least 3 characters.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new Error('Use lowercase letters, numbers, and hyphens only.');
  }
  if (RESERVED_SLUGS.has(normalized)) {
    throw new Error('That workspace URL is reserved. Try another.');
  }
  return normalized;
}

export interface PortalOrganization {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  hasFavicon: boolean;
  faviconUpdatedAt: number | null;
}

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  display_name: string | null;
  logo_url: string | null;
  website_url: string | null;
  has_favicon?: number | null;
  favicon_updated_at?: number | null;
};

function mapOrg(row: OrgRow): PortalOrganization {
  const slug = (row.slug || DEFAULT_ORG_SLUG).toLowerCase();
  const displayName = row.display_name || row.name;
  return {
    id: row.id,
    slug,
    name: row.name,
    displayName,
    logoUrl: row.logo_url,
    websiteUrl: row.website_url,
    hasFavicon: Boolean(row.has_favicon),
    faviconUpdatedAt: row.favicon_updated_at ?? null,
  };
}

function wovenSageFallback(): PortalOrganization {
  return {
    id: DEFAULT_ORG_ID,
    slug: DEFAULT_ORG_SLUG,
    name: 'Woven Sage Counseling',
    displayName: 'Woven Sage Counseling',
    logoUrl: 'https://wovensage.com/images/logo-text-header-transparent.png',
    websiteUrl: 'https://wovensage.com',
    hasFavicon: false,
    faviconUpdatedAt: null,
  };
}

const ORG_SELECT = `id, name, slug, display_name, logo_url, website_url,
  CASE WHEN favicon_data IS NOT NULL AND favicon_data != '' THEN 1 ELSE 0 END AS has_favicon,
  favicon_updated_at`;

const ORG_SELECT_LEGACY = `id, name, slug, display_name, logo_url, website_url`;

export const ORG_FAVICON_MAX_BYTES = 1_200_000;
export const ORG_FAVICON_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
]);

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function isCoordityApexHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(':')[0] ?? '';
  return COORDITY_APEX_HOSTS.has(host);
}

/** Extract tenant slug from hostname, or null on Coordity apex. */
export function slugFromHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().split(':')[0] ?? '';

  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return DEFAULT_ORG_SLUG;
  }

  if (host === 'portal.wovensage.com' || host.endsWith('.pages.dev')) {
    return DEFAULT_ORG_SLUG;
  }

  if (isCoordityApexHost(host)) {
    return null;
  }

  const coorditySuffix = '.coordity.com';
  if (host.endsWith(coorditySuffix)) {
    const slug = host.slice(0, -coorditySuffix.length);
    if (!slug || slug === 'www') return null;
    return slug;
  }

  return DEFAULT_ORG_SLUG;
}

export function tenantOrigin(slug: string, requestUrl?: string): string {
  if (requestUrl) {
    const url = new URL(requestUrl);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.pages.dev')) {
      return url.origin;
    }
    if (host.endsWith('.coordity.com') || isCoordityApexHost(host)) {
      return `${url.protocol}//${slug}.coordity.com`;
    }
  }
  return `https://${slug}.coordity.com`;
}

export async function getOrganizationById(id: string): Promise<PortalOrganization | null> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(`SELECT ${ORG_SELECT} FROM organization WHERE id = ?`)
      .bind(id)
      .first<OrgRow>();
    return row ? mapOrg(row) : null;
  } catch {
    try {
      const row = await DB.prepare(`SELECT ${ORG_SELECT_LEGACY} FROM organization WHERE id = ?`)
        .bind(id)
        .first<OrgRow>();
      return row ? mapOrg(row) : null;
    } catch {
      return id === DEFAULT_ORG_ID ? wovenSageFallback() : null;
    }
  }
}

export async function getOrganizationBySlug(slug: string): Promise<PortalOrganization | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(`SELECT ${ORG_SELECT} FROM organization WHERE lower(slug) = ?`)
      .bind(normalized)
      .first<OrgRow>();
    return row ? mapOrg(row) : null;
  } catch {
    try {
      const row = await DB.prepare(
        `SELECT ${ORG_SELECT_LEGACY} FROM organization WHERE lower(slug) = ?`,
      )
        .bind(normalized)
        .first<OrgRow>();
      return row ? mapOrg(row) : null;
    } catch {
      return normalized === DEFAULT_ORG_SLUG ? wovenSageFallback() : null;
    }
  }
}

/** Resolve org from Host header. Apex Coordity hosts return null (product shell). */
export async function resolveOrganizationFromHost(
  hostname: string,
): Promise<PortalOrganization | null> {
  const slug = slugFromHostname(hostname);
  if (!slug) return null;
  const org = await getOrganizationBySlug(slug);
  if (org) return org;
  if (slug === DEFAULT_ORG_SLUG) return wovenSageFallback();
  return null;
}

/** Prefer request tenant; fall back to Woven Sage for local/legacy hosts. */
export function orgIdFromLocals(organization: PortalOrganization | null | undefined): string {
  return organization?.id ?? DEFAULT_ORG_ID;
}

export async function isOrganizationMember(orgId: string, userId: string): Promise<boolean> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT 1 AS ok FROM organization_member WHERE org_id = ? AND user_id = ?`,
    )
      .bind(orgId, userId)
      .first<{ ok: number }>();
    return Boolean(row);
  } catch {
    // Pre-migration: treat everyone as a member of the default org only.
    return orgId === DEFAULT_ORG_ID;
  }
}

export async function addOrganizationMember(orgId: string, userId: string): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT OR IGNORE INTO organization_member (org_id, user_id, created_at) VALUES (?, ?, ?)`,
  )
    .bind(orgId, userId, nowMs())
    .run();
}

export async function createOrganization(input: {
  name: string;
  slug: string;
  displayName?: string;
  websiteUrl?: string | null;
}): Promise<PortalOrganization> {
  const slug = assertValidOrgSlug(input.slug);
  const existing = await getOrganizationBySlug(slug);
  if (existing) {
    throw new Error('That workspace URL is already taken.');
  }

  const name = input.name.trim();
  if (name.length < 2) throw new Error('Company name is required.');
  if (name.length > 80) throw new Error('Company name must be 80 characters or fewer.');

  const displayName = (input.displayName ?? name).trim() || name;
  let websiteUrl = input.websiteUrl?.trim() || null;
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl.includes('://') ? websiteUrl : `https://${websiteUrl}`);
      websiteUrl = parsed.toString();
    } catch {
      throw new Error('Website URL is invalid.');
    }
  }

  const { DB } = getEnv();
  const id = `org_${slug}`.slice(0, 64);
  const ts = nowMs();

  // Avoid collisions if slug was reused with a different id pattern.
  const idClash = await getOrganizationById(id);
  const orgId = idClash ? `org_${randomToken(8)}` : id;

  await DB.prepare(
    `INSERT INTO organization (id, name, created_at, slug, display_name, logo_url, website_url, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(orgId, name, ts, slug, displayName, websiteUrl, ts)
    .run();

  const org = await getOrganizationById(orgId);
  if (!org) throw new Error('Could not create workspace.');
  return org;
}

export async function findOrganizationsByQuery(query: string, limit = 8): Promise<PortalOrganization[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const { DB } = getEnv();
  try {
    const rows = await DB.prepare(
      `SELECT ${ORG_SELECT}
       FROM organization
       WHERE slug IS NOT NULL
         AND (
           lower(slug) LIKE ?
           OR lower(name) LIKE ?
           OR lower(COALESCE(display_name, '')) LIKE ?
         )
       ORDER BY display_name COLLATE NOCASE, name COLLATE NOCASE
       LIMIT ?`,
    )
      .bind(`%${q}%`, `%${q}%`, `%${q}%`, limit)
      .all<OrgRow>();
    return (rows.results ?? []).map(mapOrg);
  } catch {
    try {
      const rows = await DB.prepare(
        `SELECT ${ORG_SELECT_LEGACY}
         FROM organization
         WHERE slug IS NOT NULL
           AND (
             lower(slug) LIKE ?
             OR lower(name) LIKE ?
             OR lower(COALESCE(display_name, '')) LIKE ?
           )
         ORDER BY display_name COLLATE NOCASE, name COLLATE NOCASE
         LIMIT ?`,
      )
        .bind(`%${q}%`, `%${q}%`, `%${q}%`, limit)
        .all<OrgRow>();
      return (rows.results ?? []).map(mapOrg);
    } catch {
      const fallback = wovenSageFallback();
      const hay = `${fallback.slug} ${fallback.name} ${fallback.displayName}`.toLowerCase();
      return hay.includes(q) ? [fallback] : [];
    }
  }
}

export async function getOrganizationFavicon(
  orgId: string,
): Promise<{ mime: string; dataBase64: string; updatedAt: number | null } | null> {
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT favicon_mime AS mime, favicon_data AS dataBase64, favicon_updated_at AS updatedAt
       FROM organization
       WHERE id = ?
         AND favicon_data IS NOT NULL
         AND favicon_data != ''
         AND favicon_mime IS NOT NULL
         AND favicon_mime != ''`,
    )
      .bind(orgId)
      .first<{ mime: string; dataBase64: string; updatedAt: number | null }>();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function updateOrganizationFavicon(input: {
  orgId: string;
  file?: File | null;
  clear?: boolean;
}): Promise<PortalOrganization> {
  const { DB } = getEnv();
  const ts = nowMs();

  if (input.clear) {
    await DB.prepare(
      `UPDATE organization
       SET favicon_mime = NULL, favicon_data = NULL, favicon_updated_at = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(ts, ts, input.orgId)
      .run();
  } else if (input.file && input.file.size > 0) {
    const mime = input.file.type || 'image/png';
    if (!ORG_FAVICON_TYPES.has(mime)) {
      throw new Error('Use a PNG, JPEG, WebP, ICO, or SVG favicon.');
    }
    if (input.file.size > ORG_FAVICON_MAX_BYTES) {
      throw new Error('Favicon is too large (max about 1.2MB).');
    }
    const data = await fileToBase64(input.file);
    await DB.prepare(
      `UPDATE organization
       SET favicon_mime = ?, favicon_data = ?, favicon_updated_at = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(mime, data, ts, ts, input.orgId)
      .run();
  } else {
    throw new Error('Choose a favicon image to upload.');
  }

  const org = await getOrganizationById(input.orgId);
  if (!org) throw new Error('Organization not found.');
  return org;
}
