import { getEnv } from './env';

/** Default org until host resolution supplies a tenant (local / legacy). */
export const DEFAULT_ORG_ID = 'org_wovensage';
export const DEFAULT_ORG_SLUG = 'wovensage';

export const COORDITY_PRODUCT_NAME = 'Coordity';
export const COORDITY_APEX_HOSTS = new Set([
  'coordity.com',
  'www.coordity.com',
]);

export interface PortalOrganization {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
}

type OrgRow = {
  id: string;
  name: string;
  slug: string | null;
  display_name: string | null;
  logo_url: string | null;
  website_url: string | null;
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
  };
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
    const row = await DB.prepare(
      `SELECT id, name, slug, display_name, logo_url, website_url
       FROM organization WHERE id = ?`,
    )
      .bind(id)
      .first<OrgRow>();
    return row ? mapOrg(row) : null;
  } catch {
    return id === DEFAULT_ORG_ID ? wovenSageFallback() : null;
  }
}

export async function getOrganizationBySlug(slug: string): Promise<PortalOrganization | null> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  const { DB } = getEnv();
  try {
    const row = await DB.prepare(
      `SELECT id, name, slug, display_name, logo_url, website_url
       FROM organization WHERE lower(slug) = ?`,
    )
      .bind(normalized)
      .first<OrgRow>();
    return row ? mapOrg(row) : null;
  } catch {
    return normalized === DEFAULT_ORG_SLUG ? wovenSageFallback() : null;
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

export async function findOrganizationsByQuery(query: string, limit = 8): Promise<PortalOrganization[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const { DB } = getEnv();
  try {
    const rows = await DB.prepare(
      `SELECT id, name, slug, display_name, logo_url, website_url
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
