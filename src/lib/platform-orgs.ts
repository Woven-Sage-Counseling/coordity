import { getEnv } from './env';
import { nowMs } from './crypto';
import {
  COORDITY_SYSTEM_USER_ID,
  createOrganization,
  getOrganizationById,
  normalizeOrgSlug,
  tenantOrigin,
  type PortalOrganization,
} from './organization';
import { createInvitation } from './invites';

export interface PlatformOrgRow {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  websiteUrl: string | null;
  createdAt: number | null;
  archivedAt: number | null;
  primarySubscriberName: string | null;
  primarySubscriberEmail: string | null;
  pendingOwnerEmail: string | null;
}

export async function listPlatformOrganizations(options?: {
  includeArchived?: boolean;
}): Promise<PlatformOrgRow[]> {
  const { DB } = getEnv();
  const includeArchived = Boolean(options?.includeArchived);
  const rows = await DB.prepare(
    `SELECT
        o.id,
        o.slug,
        o.name,
        COALESCE(o.display_name, o.name) AS display_name,
        o.website_url,
        o.created_at,
        o.archived_at
     FROM organization o
     WHERE o.slug IS NOT NULL
       ${includeArchived ? '' : 'AND o.archived_at IS NULL'}
     ORDER BY COALESCE(o.display_name, o.name) COLLATE NOCASE`,
  ).all<{
    id: string;
    slug: string;
    name: string;
    display_name: string;
    website_url: string | null;
    created_at: number | null;
    archived_at: number | null;
  }>();

  const orgs: PlatformOrgRow[] = [];
  for (const row of rows.results ?? []) {
    const owner = await DB.prepare(
      `SELECT u.name, u.email, om.created_at
       FROM organization_member om
       JOIN user u ON u.id = om.user_id
       JOIN user_role ur ON ur.user_id = om.user_id
       JOIN role r ON r.id = ur.role_id AND r.key = 'owner'
       JOIN employee_profile p ON p.user_id = om.user_id AND p.status = 'active'
       WHERE om.org_id = ?
       ORDER BY om.created_at ASC
       LIMIT 1`,
    )
      .bind(row.id)
      .first<{ name: string; email: string }>();

    let pendingOwnerEmail: string | null = null;
    if (!owner) {
      try {
        const invite = await DB.prepare(
          `SELECT email
           FROM invitation
           WHERE org_id = ? AND role_id = 'role_owner' AND accepted_at IS NULL
           ORDER BY created_at ASC
           LIMIT 1`,
        )
          .bind(row.id)
          .first<{ email: string }>();
        pendingOwnerEmail = invite?.email ?? null;
      } catch {
        pendingOwnerEmail = null;
      }
    }

    orgs.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      displayName: row.display_name,
      websiteUrl: row.website_url,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
      primarySubscriberName: owner?.name ?? null,
      primarySubscriberEmail: owner?.email ?? null,
      pendingOwnerEmail,
    });
  }
  return orgs;
}

export async function countPlatformOrganizations(): Promise<{ active: number; archived: number }> {
  const { DB } = getEnv();
  const active = await DB.prepare(
    `SELECT COUNT(*) AS n FROM organization WHERE slug IS NOT NULL AND archived_at IS NULL`,
  ).first<{ n: number }>();
  const archived = await DB.prepare(
    `SELECT COUNT(*) AS n FROM organization WHERE slug IS NOT NULL AND archived_at IS NOT NULL`,
  ).first<{ n: number }>();
  return { active: Number(active?.n ?? 0), archived: Number(archived?.n ?? 0) };
}

export async function createPlatformOrganization(input: {
  companyName: string;
  slug?: string;
  websiteUrl?: string | null;
  adminName: string;
  adminEmail: string;
  requestUrl: string;
  actorUserId: string;
}): Promise<{ org: PortalOrganization; inviteUrl: string }> {
  const org = await createOrganization({
    name: input.companyName,
    slug: normalizeOrgSlug(input.slug || input.companyName),
    displayName: input.companyName,
    websiteUrl: input.websiteUrl ?? null,
  });

  const origin = tenantOrigin(org.slug, input.requestUrl);
  const invite = await createInvitation({
    email: input.adminEmail,
    name: input.adminName,
    roleId: 'role_owner',
    actorUserId: input.actorUserId || COORDITY_SYSTEM_USER_ID,
    origin,
    orgId: org.id,
  });

  return { org, inviteUrl: invite.inviteUrl };
}

export async function archiveOrganization(orgId: string): Promise<PortalOrganization> {
  const { DB } = getEnv();
  const existing = await getOrganizationById(orgId);
  if (!existing) throw new Error('Organization not found.');
  if (existing.slug === 'wovensage') {
    throw new Error('The Woven Sage workspace cannot be archived from the platform console.');
  }
  const ts = nowMs();
  await DB.prepare(`UPDATE organization SET archived_at = ?, updated_at = ? WHERE id = ?`)
    .bind(ts, ts, orgId)
    .run();
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error('Organization not found.');
  return org;
}

export async function restoreOrganization(orgId: string): Promise<PortalOrganization> {
  const { DB } = getEnv();
  const ts = nowMs();
  await DB.prepare(`UPDATE organization SET archived_at = NULL, updated_at = ? WHERE id = ?`)
    .bind(ts, orgId)
    .run();
  const org = await getOrganizationById(orgId);
  if (!org) throw new Error('Organization not found.');
  return org;
}
