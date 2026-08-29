import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';
import { listDirectoryClinicians } from './employees';
import { hasPermission, isOwnerEmail } from './permissions';

export type CoverageStatus = 'accepted' | 'credentialing';

export interface CredentialingProvider {
  id: string;
  name: string;
  userId: string | null;
  /** True when this row was synced from a directory clinician. */
  fromDirectory?: boolean;
}

export interface InsuranceGroup {
  id: string;
  name: string;
  sortOrder: number;
  plans: InsurancePlan[];
}

export interface InsurancePlan {
  id: string;
  groupId: string;
  name: string;
  sortOrder: number;
}

export interface ProviderCoverageRow {
  coverageId: string;
  planId: string;
  planName: string;
  groupId: string;
  groupName: string;
  status: CoverageStatus;
}

export function canSeeCredentialing(employee: PortalEmployee | null): boolean {
  return hasPermission(employee, 'credentialing:view');
}

export function canManageCredentialing(employee: PortalEmployee | null): boolean {
  return hasPermission(employee, 'credentialing:manage');
}

/** Owners, finance, and managers can look up any provider; clinicians see themselves. */
export function canLookupAnyProvider(employee: PortalEmployee | null): boolean {
  if (!employee || employee.status !== 'active') return false;
  if (isOwnerEmail(employee.email)) return true;
  return (
    employee.roles.includes('owner') ||
    employee.roles.includes('owner_view') ||
    employee.roles.includes('finance') ||
    employee.roles.includes('manager')
  );
}

export async function listCredentialingProviders(): Promise<CredentialingProvider[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, name, user_id
     FROM credentialing_provider
     ORDER BY name COLLATE NOCASE`,
  ).all<{ id: string; name: string; user_id: string | null }>();

  return (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    userId: row.user_id,
  }));
}

/**
 * Ensures directory clinicians have credentialing provider rows, then returns
 * only directory-backed providers.
 */
export async function listProvidersForLookup(): Promise<CredentialingProvider[]> {
  await syncProvidersFromDirectory();
  const providers = await listCredentialingProviders();
  const clinicians = await listDirectoryClinicians();
  const clinicianIds = new Set(clinicians.map((person) => person.id));

  return providers
    .filter((provider) => provider.userId && clinicianIds.has(provider.userId))
    .map((provider) => ({
      ...provider,
      fromDirectory: true,
    }));
}

async function ensureProviderForUser(userId: string, name: string): Promise<CredentialingProvider> {
  const { DB } = getEnv();
  const existing = await DB.prepare(
    `SELECT id, name, user_id
     FROM credentialing_provider
     WHERE user_id = ?
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string; name: string; user_id: string | null }>();

  if (existing) {
    if (existing.name !== name.trim() && name.trim()) {
      await DB.prepare(`UPDATE credentialing_provider SET name = ? WHERE id = ?`)
        .bind(name.trim(), existing.id)
        .run();
      return { id: existing.id, name: name.trim(), userId: existing.user_id };
    }
    return { id: existing.id, name: existing.name, userId: existing.user_id };
  }

  const id = randomToken(16);
  await DB.prepare(
    `INSERT INTO credentialing_provider (id, name, user_id, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(id, name.trim(), userId, nowMs())
    .run();

  return { id, name: name.trim(), userId };
}

/** Create/update credentialing providers for everyone on the Clinical directory team or clinician role. */
export async function syncProvidersFromDirectory(): Promise<void> {
  const clinicians = await listDirectoryClinicians();
  for (const person of clinicians) {
    await ensureProviderForUser(person.id, person.name);
  }
}

export async function getProviderForUser(userId: string): Promise<CredentialingProvider | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, name, user_id
     FROM credentialing_provider
     WHERE user_id = ?
     LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string; name: string; user_id: string | null }>();

  if (row) {
    return { id: row.id, name: row.name, userId: row.user_id };
  }

  // Auto-link if this person is a directory clinician.
  const clinicians = await listDirectoryClinicians();
  const match = clinicians.find((person) => person.id === userId);
  if (!match) return null;
  return ensureProviderForUser(match.id, match.name);
}

export async function getProviderById(providerId: string): Promise<CredentialingProvider | null> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, name, user_id
     FROM credentialing_provider
     WHERE id = ?
     LIMIT 1`,
  )
    .bind(providerId)
    .first<{ id: string; name: string; user_id: string | null }>();

  if (!row) return null;
  return { id: row.id, name: row.name, userId: row.user_id };
}

export async function listProviderCoverage(providerId: string): Promise<ProviderCoverageRow[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT
        c.id AS coverage_id,
        p.id AS plan_id,
        p.name AS plan_name,
        g.id AS group_id,
        g.name AS group_name,
        c.status
     FROM provider_plan_coverage c
     JOIN insurance_plan p ON p.id = c.plan_id
     JOIN insurance_group g ON g.id = p.group_id
     WHERE c.provider_id = ?
     ORDER BY g.sort_order, g.name COLLATE NOCASE, p.sort_order, p.name COLLATE NOCASE`,
  )
    .bind(providerId)
    .all<{
      coverage_id: string;
      plan_id: string;
      plan_name: string;
      group_id: string;
      group_name: string;
      status: CoverageStatus;
    }>();

  return (rows.results ?? []).map((row) => ({
    coverageId: row.coverage_id,
    planId: row.plan_id,
    planName: row.plan_name,
    groupId: row.group_id,
    groupName: row.group_name,
    status: row.status,
  }));
}

export async function listInsuranceCatalog(): Promise<InsuranceGroup[]> {
  const { DB } = getEnv();
  const groups = await DB.prepare(
    `SELECT id, name, sort_order
     FROM insurance_group
     ORDER BY sort_order, name COLLATE NOCASE`,
  ).all<{ id: string; name: string; sort_order: number }>();

  const plans = await DB.prepare(
    `SELECT id, group_id, name, sort_order
     FROM insurance_plan
     ORDER BY sort_order, name COLLATE NOCASE`,
  ).all<{ id: string; group_id: string; name: string; sort_order: number }>();

  const plansByGroup = new Map<string, InsurancePlan[]>();
  for (const plan of plans.results ?? []) {
    const list = plansByGroup.get(plan.group_id) ?? [];
    list.push({
      id: plan.id,
      groupId: plan.group_id,
      name: plan.name,
      sortOrder: plan.sort_order,
    });
    plansByGroup.set(plan.group_id, list);
  }

  return (groups.results ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    sortOrder: group.sort_order,
    plans: plansByGroup.get(group.id) ?? [],
  }));
}

export async function createInsuranceGroup(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Insurance group name is required.');

  const { DB } = getEnv();
  const id = randomToken(16);
  const max = await DB.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM insurance_group`).first<{
    max_order: number;
  }>();

  await DB.prepare(
    `INSERT INTO insurance_group (id, name, sort_order, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(id, trimmed, (max?.max_order ?? -1) + 1, nowMs())
    .run();

  return id;
}

export async function createInsurancePlan(groupId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Plan name is required.');

  const { DB } = getEnv();
  const group = await DB.prepare(`SELECT id FROM insurance_group WHERE id = ?`)
    .bind(groupId)
    .first<{ id: string }>();
  if (!group) throw new Error('That insurance group was not found.');

  const id = randomToken(16);
  const max = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM insurance_plan WHERE group_id = ?`,
  )
    .bind(groupId)
    .first<{ max_order: number }>();

  await DB.prepare(
    `INSERT INTO insurance_plan (id, group_id, name, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, groupId, trimmed, (max?.max_order ?? -1) + 1, nowMs())
    .run();

  return id;
}

export async function updateInsuranceGroup(groupId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Insurance group name is required.');

  const { DB } = getEnv();
  const result = await DB.prepare(`UPDATE insurance_group SET name = ? WHERE id = ?`)
    .bind(trimmed, groupId)
    .run();
  if ((result.meta.changes ?? 0) === 0) throw new Error('That insurance group was not found.');
}

export async function updateInsurancePlan(planId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Plan name is required.');

  const { DB } = getEnv();
  const result = await DB.prepare(`UPDATE insurance_plan SET name = ? WHERE id = ?`)
    .bind(trimmed, planId)
    .run();
  if ((result.meta.changes ?? 0) === 0) throw new Error('That plan was not found.');
}

export async function setProviderPlanCoverage(input: {
  providerId: string;
  planId: string;
  status: CoverageStatus | 'none';
  actorId: string;
}): Promise<void> {
  const { DB } = getEnv();
  const provider = await DB.prepare(`SELECT id FROM credentialing_provider WHERE id = ?`)
    .bind(input.providerId)
    .first<{ id: string }>();
  if (!provider) throw new Error('That provider was not found.');

  const plan = await DB.prepare(`SELECT id FROM insurance_plan WHERE id = ?`)
    .bind(input.planId)
    .first<{ id: string }>();
  if (!plan) throw new Error('That plan was not found.');

  if (input.status === 'none') {
    await DB.prepare(`DELETE FROM provider_plan_coverage WHERE provider_id = ? AND plan_id = ?`)
      .bind(input.providerId, input.planId)
      .run();
    return;
  }

  const existing = await DB.prepare(
    `SELECT id FROM provider_plan_coverage WHERE provider_id = ? AND plan_id = ?`,
  )
    .bind(input.providerId, input.planId)
    .first<{ id: string }>();

  const ts = nowMs();
  if (existing) {
    await DB.prepare(
      `UPDATE provider_plan_coverage
       SET status = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    )
      .bind(input.status, ts, input.actorId, existing.id)
      .run();
    return;
  }

  await DB.prepare(
    `INSERT INTO provider_plan_coverage (id, provider_id, plan_id, status, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(randomToken(16), input.providerId, input.planId, input.status, ts, input.actorId)
    .run();
}

export async function deleteInsuranceGroup(groupId: string): Promise<void> {
  const { DB } = getEnv();
  const result = await DB.prepare(`DELETE FROM insurance_group WHERE id = ?`).bind(groupId).run();
  if ((result.meta.changes ?? 0) === 0) throw new Error('That insurance group was not found.');
}

export async function deleteInsurancePlan(planId: string): Promise<void> {
  const { DB } = getEnv();
  const result = await DB.prepare(`DELETE FROM insurance_plan WHERE id = ?`).bind(planId).run();
  if ((result.meta.changes ?? 0) === 0) throw new Error('That plan was not found.');
}

export function coverageStatusLabel(status: CoverageStatus): string {
  return status === 'accepted' ? 'Accepted' : 'Credentialing';
}
