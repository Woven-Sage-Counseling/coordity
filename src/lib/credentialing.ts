import { getEnv } from './env';
import { nowMs, randomToken } from './crypto';
import { listDirectoryClinicians } from './employees';
import { hasPermission, isOwnerEmail } from './permissions';
import {
  COVERAGE_STATUS_VALUES,
  coverageCellKey,
  groupCoverageCellKey,
  isPublicCoverageStatus,
  normalizeCoverageStatus,
  type CoverageStatus,
  type CoverageStatusKey,
} from './credentialing-status';

function isMissingProviderGroupCoverageTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('no such table') && message.includes('provider_group_coverage');
}

export {
  COVERAGE_STATUS_OPTIONS,
  COVERAGE_STATUS_VALUES,
  coverageCellKey,
  groupCoverageCellKey,
  coverageStatusLabel,
  coverageStatusPillClass,
  isPublicCoverageStatus,
  normalizeCoverageStatus,
  type CoverageStatus,
  type CoverageStatusKey,
} from './credentialing-status';

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

export async function listProviderCoverage(
  providerId: string,
  options: { publicOnly?: boolean } = {},
): Promise<ProviderCoverageRow[]> {
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
      status: string;
    }>();

  const mapped = (rows.results ?? [])
    .map((row) => {
      const status = normalizeCoverageStatus(row.status);
      if (!status) return null;
      return {
        coverageId: row.coverage_id,
        planId: row.plan_id,
        planName: row.plan_name,
        groupId: row.group_id,
        groupName: row.group_name,
        status,
      };
    })
    .filter((row): row is ProviderCoverageRow => row !== null);

  if (options.publicOnly) {
    return mapped.filter((row) => isPublicCoverageStatus(row.status));
  }

  return mapped;
}

export async function listCoverageMatrix(): Promise<Record<string, CoverageStatus>> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT provider_id, plan_id, status FROM provider_plan_coverage`,
  ).all<{ provider_id: string; plan_id: string; status: string }>();

  const map: Record<string, CoverageStatus> = {};
  for (const row of rows.results ?? []) {
    const status = normalizeCoverageStatus(row.status);
    if (!status) continue;
    map[coverageCellKey(row.provider_id, row.plan_id)] = status;
  }
  return map;
}

export async function listGroupCoverageMatrix(): Promise<Record<string, CoverageStatus>> {
  const { DB } = getEnv();
  try {
    const rows = await DB.prepare(
      `SELECT provider_id, group_id, status FROM provider_group_coverage`,
    ).all<{ provider_id: string; group_id: string; status: string }>();

    const map: Record<string, CoverageStatus> = {};
    for (const row of rows.results ?? []) {
      const status = normalizeCoverageStatus(row.status);
      if (!status) continue;
      map[groupCoverageCellKey(row.provider_id, row.group_id)] = status;
    }
    return map;
  } catch (error) {
    if (isMissingProviderGroupCoverageTable(error)) {
      console.warn('provider_group_coverage table missing; run D1 migrations');
      return {};
    }
    throw error;
  }
}

export interface PublicInsurancePlan {
  planId: string;
  planName: string;
  sortOrder: number;
}

export interface PublicInsuranceGroup {
  groupId: string;
  groupName: string;
  sortOrder: number;
  inNetworkPlans: PublicInsurancePlan[];
  comingSoonPlans: PublicInsurancePlan[];
  /** In-network at the insurance company level without plan rows. */
  inNetworkAtNetworkLevel?: boolean;
  /** Credentialing at the insurance company level without plan rows. */
  credentialingAtNetworkLevel?: boolean;
}

export interface PublicInsuranceNetwork {
  groupId: string;
  groupName: string;
  sortOrder: number;
}

export interface PublicInsuranceNetworks {
  inNetwork: PublicInsuranceNetwork[];
  comingSoon: PublicInsuranceNetwork[];
}

interface PublicInsuranceGroupState {
  groupId: string;
  groupName: string;
  sortOrder: number;
  inNetworkPlans: PublicInsurancePlan[];
  comingSoonPlans: PublicInsurancePlan[];
  inNetworkAtNetworkLevel: boolean;
  credentialingAtNetworkLevel: boolean;
}

function emptyPublicInsuranceGroupState(
  groupId: string,
  groupName: string,
  sortOrder: number,
): PublicInsuranceGroupState {
  return {
    groupId,
    groupName,
    sortOrder,
    inNetworkPlans: [],
    comingSoonPlans: [],
    inNetworkAtNetworkLevel: false,
    credentialingAtNetworkLevel: false,
  };
}

async function loadPublicInsuranceGroupStates(): Promise<PublicInsuranceGroupState[]> {
  const providers = await listProvidersForLookup();
  if (providers.length === 0) return [];

  const providerIds = providers.map((provider) => provider.id);
  const placeholders = providerIds.map(() => '?').join(', ');

  const { DB } = getEnv();

  let groupCoverageRows: {
    results?: Array<{
      group_id: string;
      group_name: string;
      group_sort_order: number;
      status: string;
    }>;
  } = { results: [] };

  try {
    groupCoverageRows = await DB.prepare(
      `SELECT
          g.id AS group_id,
          g.name AS group_name,
          g.sort_order AS group_sort_order,
          c.status
       FROM provider_group_coverage c
       JOIN insurance_group g ON g.id = c.group_id
       WHERE c.provider_id IN (${placeholders})
         AND c.status IN ('in_network', 'credentialing')`,
    )
      .bind(...providerIds)
      .all<{
        group_id: string;
        group_name: string;
        group_sort_order: number;
        status: string;
      }>();
  } catch (error) {
    if (!isMissingProviderGroupCoverageTable(error)) throw error;
    console.warn('provider_group_coverage table missing; run D1 migrations');
  }

  const groups = new Map<string, PublicInsuranceGroupState>();
  for (const row of groupCoverageRows.results ?? []) {
    const status = normalizeCoverageStatus(row.status);
    if (status !== 'in_network' && status !== 'credentialing') continue;

    let group =
      groups.get(row.group_id) ??
      emptyPublicInsuranceGroupState(row.group_id, row.group_name, row.group_sort_order);
    if (status === 'in_network') group.inNetworkAtNetworkLevel = true;
    if (status === 'credentialing') group.credentialingAtNetworkLevel = true;
    groups.set(row.group_id, group);
  }

  const rows = await DB.prepare(
    `SELECT
        p.id AS plan_id,
        p.name AS plan_name,
        p.sort_order AS plan_sort_order,
        g.id AS group_id,
        g.name AS group_name,
        g.sort_order AS group_sort_order,
        c.status
     FROM provider_plan_coverage c
     JOIN insurance_plan p ON p.id = c.plan_id
     JOIN insurance_group g ON g.id = p.group_id
     WHERE c.provider_id IN (${placeholders})
       AND c.status IN ('in_network', 'credentialing')`,
  )
    .bind(...providerIds)
    .all<{
      plan_id: string;
      plan_name: string;
      plan_sort_order: number;
      group_id: string;
      group_name: string;
      group_sort_order: number;
      status: string;
    }>();

  const planBuckets = new Map<
    string,
    {
      planId: string;
      planName: string;
      sortOrder: number;
      groupId: string;
      groupName: string;
      groupSortOrder: number;
      hasInNetwork: boolean;
      hasCredentialing: boolean;
    }
  >();

  for (const row of rows.results ?? []) {
    const status = normalizeCoverageStatus(row.status);
    if (status !== 'in_network' && status !== 'credentialing') continue;

    const existing = planBuckets.get(row.plan_id);
    if (existing) {
      if (status === 'in_network') existing.hasInNetwork = true;
      if (status === 'credentialing') existing.hasCredentialing = true;
      continue;
    }

    planBuckets.set(row.plan_id, {
      planId: row.plan_id,
      planName: row.plan_name,
      sortOrder: row.plan_sort_order,
      groupId: row.group_id,
      groupName: row.group_name,
      groupSortOrder: row.group_sort_order,
      hasInNetwork: status === 'in_network',
      hasCredentialing: status === 'credentialing',
    });
  }

  for (const plan of planBuckets.values()) {
    let group =
      groups.get(plan.groupId) ??
      emptyPublicInsuranceGroupState(plan.groupId, plan.groupName, plan.groupSortOrder);

    const entry = {
      planId: plan.planId,
      planName: plan.planName,
      sortOrder: plan.sortOrder,
    };

    if (plan.hasInNetwork) {
      if (!group.inNetworkPlans.some((item) => item.planId === plan.planId)) {
        group.inNetworkPlans.push(entry);
      }
      groups.set(plan.groupId, group);
      continue;
    }

    if (plan.hasCredentialing) {
      if (!group.comingSoonPlans.some((item) => item.planId === plan.planId)) {
        group.comingSoonPlans.push(entry);
      }
      groups.set(plan.groupId, group);
    }
  }

  const sortPlans = (left: PublicInsurancePlan, right: PublicInsurancePlan) =>
    left.sortOrder - right.sortOrder || left.planName.localeCompare(right.planName);

  return [...groups.values()]
    .map((group) => ({
      ...group,
      inNetworkPlans: [...group.inNetworkPlans].sort(sortPlans),
      comingSoonPlans: [...group.comingSoonPlans].sort(sortPlans),
    }))
    .filter(
      (group) =>
        group.inNetworkPlans.length > 0 ||
        group.comingSoonPlans.length > 0 ||
        group.inNetworkAtNetworkLevel ||
        group.credentialingAtNetworkLevel,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder || left.groupName.localeCompare(right.groupName));
}

/** Practice-wide insurance list for the employee credentialing page (includes plans). */
export async function listPublicInsuranceDisplay(): Promise<PublicInsuranceGroup[]> {
  return loadPublicInsuranceGroupStates();
}

/** Practice-wide insurance networks for the public marketing site (companies only). */
export async function listPublicInsuranceNetworks(): Promise<PublicInsuranceNetworks> {
  const states = await loadPublicInsuranceGroupStates();
  const inNetwork: PublicInsuranceNetwork[] = [];
  const comingSoon: PublicInsuranceNetwork[] = [];

  for (const state of states) {
    const network = {
      groupId: state.groupId,
      groupName: state.groupName,
      sortOrder: state.sortOrder,
    };
    if (state.inNetworkPlans.length > 0 || state.inNetworkAtNetworkLevel) {
      inNetwork.push(network);
      continue;
    }
    if (state.comingSoonPlans.length > 0 || state.credentialingAtNetworkLevel) {
      comingSoon.push(network);
    }
  }

  const sortNetworks = (left: PublicInsuranceNetwork, right: PublicInsuranceNetwork) =>
    left.sortOrder - right.sortOrder || left.groupName.localeCompare(right.groupName);

  return {
    inNetwork: inNetwork.sort(sortNetworks),
    comingSoon: comingSoon.sort(sortNetworks),
  };
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

export async function setProviderGroupCoverage(input: {
  providerId: string;
  groupId: string;
  status: CoverageStatusKey;
  actorId: string;
}): Promise<void> {
  const { DB } = getEnv();
  const provider = await DB.prepare(`SELECT id FROM credentialing_provider WHERE id = ?`)
    .bind(input.providerId)
    .first<{ id: string }>();
  if (!provider) throw new Error('That provider was not found.');

  const group = await DB.prepare(`SELECT id FROM insurance_group WHERE id = ?`)
    .bind(input.groupId)
    .first<{ id: string }>();
  if (!group) throw new Error('That insurance company was not found.');

  if (input.status === 'not_started') {
    await DB.prepare(`DELETE FROM provider_group_coverage WHERE provider_id = ? AND group_id = ?`)
      .bind(input.providerId, input.groupId)
      .run();
    return;
  }

  if (!COVERAGE_STATUS_VALUES.includes(input.status)) {
    throw new Error('Choose a valid coverage status.');
  }

  const existing = await DB.prepare(
    `SELECT id FROM provider_group_coverage WHERE provider_id = ? AND group_id = ?`,
  )
    .bind(input.providerId, input.groupId)
    .first<{ id: string }>();

  const ts = nowMs();
  if (existing) {
    await DB.prepare(
      `UPDATE provider_group_coverage
       SET status = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
    )
      .bind(input.status, ts, input.actorId, existing.id)
      .run();
    return;
  }

  await DB.prepare(
    `INSERT INTO provider_group_coverage (id, provider_id, group_id, status, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(randomToken(16), input.providerId, input.groupId, input.status, ts, input.actorId)
    .run();
}

export async function setProviderPlanCoverage(input: {
  providerId: string;
  planId: string;
  status: CoverageStatusKey;
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

  if (input.status === 'not_started') {
    await DB.prepare(`DELETE FROM provider_plan_coverage WHERE provider_id = ? AND plan_id = ?`)
      .bind(input.providerId, input.planId)
      .run();
    return;
  }

  if (!COVERAGE_STATUS_VALUES.includes(input.status)) {
    throw new Error('Choose a valid coverage status.');
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

export async function countBulkGroupOverwrite(input: {
  providerId: string;
  groupId: string;
}): Promise<{ planCount: number; overwritten: number }> {
  const { DB } = getEnv();
  const plans = await DB.prepare(`SELECT id FROM insurance_plan WHERE group_id = ?`)
    .bind(input.groupId)
    .all<{ id: string }>();

  const planIds = (plans.results ?? []).map((row) => row.id);
  let overwritten = 0;

  const existingGroup = await DB.prepare(
    `SELECT id FROM provider_group_coverage WHERE provider_id = ? AND group_id = ?`,
  )
    .bind(input.providerId, input.groupId)
    .first<{ id: string }>();
  if (existingGroup) overwritten += 1;

  for (const planId of planIds) {
    const existing = await DB.prepare(
      `SELECT status FROM provider_plan_coverage WHERE provider_id = ? AND plan_id = ?`,
    )
      .bind(input.providerId, planId)
      .first<{ status: string }>();
    if (existing) overwritten += 1;
  }

  return { planCount: Math.max(planIds.length, 1), overwritten };
}

export async function bulkSetProviderGroupCoverage(input: {
  providerId: string;
  groupId: string;
  status: CoverageStatusKey;
  actorId: string;
}): Promise<{ updated: number }> {
  const { DB } = getEnv();
  const plans = await DB.prepare(
    `SELECT id FROM insurance_plan WHERE group_id = ? ORDER BY sort_order, name COLLATE NOCASE`,
  )
    .bind(input.groupId)
    .all<{ id: string }>();

  const planIds = (plans.results ?? []).map((row) => row.id);

  await setProviderGroupCoverage({
    providerId: input.providerId,
    groupId: input.groupId,
    status: input.status,
    actorId: input.actorId,
  });

  if (input.status === 'not_started') {
    for (const planId of planIds) {
      await setProviderPlanCoverage({
        providerId: input.providerId,
        planId,
        status: 'not_started',
        actorId: input.actorId,
      });
    }
    return { updated: Math.max(planIds.length, 1) };
  }

  for (const planId of planIds) {
    await setProviderPlanCoverage({
      providerId: input.providerId,
      planId,
      status: input.status,
      actorId: input.actorId,
    });
  }

  return { updated: Math.max(planIds.length, 1) };
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
