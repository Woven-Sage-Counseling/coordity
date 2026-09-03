import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { DEFAULT_ORG_ID } from './organization';
import { DEFAULT_TIMESHEET_WORK_CATEGORIES } from './timesheet-categories';

export interface TimesheetWorkCategory {
  id: string;
  orgId: string;
  key: string;
  label: string;
  color: string;
  sortOrder: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type WorkCategoryMeta = Pick<TimesheetWorkCategory, 'key' | 'label' | 'color'>;

export type WorkCategoryLookup = {
  list: () => WorkCategoryMeta[];
  get: (key: string) => WorkCategoryMeta | null;
  has: (key: string) => boolean;
};

type CategoryRow = {
  id: string;
  org_id: string;
  key: string;
  label: string;
  color: string;
  sort_order: number;
  active: number;
  created_at: number;
  updated_at: number;
};

let cachedLookup: { orgId: string; at: number; lookup: WorkCategoryLookup } | null = null;
const CACHE_TTL_MS = 30_000;

function mapCategory(row: CategoryRow): TimesheetWorkCategory {
  return {
    id: row.id,
    orgId: row.org_id,
    key: row.key,
    label: row.label,
    color: row.color,
    sortOrder: row.sort_order,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildWorkCategoryLookup(categories: WorkCategoryMeta[]): WorkCategoryLookup {
  const byKey = new Map(categories.map((category) => [category.key, category]));
  return {
    list: () => categories,
    get: (key: string) => byKey.get(key) ?? null,
    has: (key: string) => byKey.has(key),
  };
}

export function invalidateWorkCategoryCache(): void {
  cachedLookup = null;
}

function fallbackLookup(): WorkCategoryLookup {
  return buildWorkCategoryLookup(
    DEFAULT_TIMESHEET_WORK_CATEGORIES.map((item) => ({
      key: item.key,
      label: item.label,
      color: item.color,
    })),
  );
}

export async function getWorkCategoryLookup(orgId = DEFAULT_ORG_ID): Promise<WorkCategoryLookup> {
  const now = nowMs();
  if (cachedLookup && cachedLookup.orgId === orgId && now - cachedLookup.at < CACHE_TTL_MS) {
    return cachedLookup.lookup;
  }

  try {
    const categories = await listActiveWorkCategories(orgId);
    const lookup = categories.length > 0 ? buildWorkCategoryLookup(categories) : fallbackLookup();
    cachedLookup = { orgId, at: now, lookup };
    return lookup;
  } catch (error) {
    console.error('work category lookup failed', error);
    return fallbackLookup();
  }
}

export async function listActiveWorkCategories(orgId = DEFAULT_ORG_ID): Promise<WorkCategoryMeta[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, org_id, key, label, color, sort_order, active, created_at, updated_at
     FROM timesheet_work_category
     WHERE org_id = ? AND active = 1
     ORDER BY sort_order ASC, label ASC`,
  )
    .bind(orgId)
    .all<CategoryRow>();

  return (rows.results ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    color: row.color,
  }));
}

export async function listWorkCategoriesForAdmin(orgId = DEFAULT_ORG_ID): Promise<TimesheetWorkCategory[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, org_id, key, label, color, sort_order, active, created_at, updated_at
     FROM timesheet_work_category
     WHERE org_id = ? AND active = 1
     ORDER BY sort_order ASC, label ASC`,
  )
    .bind(orgId)
    .all<CategoryRow>();

  return (rows.results ?? []).map(mapCategory);
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function normalizeWorkCategoryColor(value: string): string {
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) {
    throw new Error('Choose a valid color.');
  }
  return trimmed.toLowerCase();
}

function slugifyLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || 'category';
}

async function nextCategoryKey(orgId: string, label: string): Promise<string> {
  const { DB } = getEnv();
  const base = slugifyLabel(label);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await DB.prepare(
      `SELECT id FROM timesheet_work_category WHERE org_id = ? AND key = ?`,
    )
      .bind(orgId, candidate)
      .first<{ id: string }>();
    if (!existing) return candidate;
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
}

async function nextSortOrder(orgId: string): Promise<number> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_order
     FROM timesheet_work_category
     WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<{ max_order: number }>();
  return (row?.max_order ?? -1) + 1;
}

export async function createWorkCategory(input: {
  orgId?: string;
  label: string;
  color: string;
}): Promise<TimesheetWorkCategory> {
  const orgId = input.orgId ?? DEFAULT_ORG_ID;
  const label = input.label.trim();
  if (!label) {
    throw new Error('Enter a name for the work item.');
  }
  if (label.length > 80) {
    throw new Error('Work item name is too long.');
  }

  const color = normalizeWorkCategoryColor(input.color);
  const key = await nextCategoryKey(orgId, label);
  const now = nowMs();
  const id = randomToken(16);
  const sortOrder = await nextSortOrder(orgId);

  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO timesheet_work_category (id, org_id, key, label, color, sort_order, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(id, orgId, key, label, color, sortOrder, now, now)
    .run();

  invalidateWorkCategoryCache();

  return {
    id,
    orgId,
    key,
    label,
    color,
    sortOrder,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateWorkCategory(input: {
  id: string;
  label: string;
  color: string;
}): Promise<TimesheetWorkCategory> {
  const label = input.label.trim();
  if (!label) {
    throw new Error('Enter a name for the work item.');
  }
  if (label.length > 80) {
    throw new Error('Work item name is too long.');
  }

  const color = normalizeWorkCategoryColor(input.color);
  const now = nowMs();
  const { DB } = getEnv();

  const existing = await DB.prepare(
    `SELECT id, org_id, key, label, color, sort_order, active, created_at, updated_at
     FROM timesheet_work_category
     WHERE id = ? AND active = 1`,
  )
    .bind(input.id)
    .first<CategoryRow>();

  if (!existing) {
    throw new Error('Work item not found.');
  }

  await DB.prepare(
    `UPDATE timesheet_work_category
     SET label = ?, color = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(label, color, now, input.id)
    .run();

  invalidateWorkCategoryCache();

  return {
    ...mapCategory(existing),
    label,
    color,
    updatedAt: now,
  };
}

export async function deactivateWorkCategory(id: string): Promise<void> {
  const { DB } = getEnv();
  const existing = await DB.prepare(`SELECT id FROM timesheet_work_category WHERE id = ? AND active = 1`)
    .bind(id)
    .first<{ id: string }>();

  if (!existing) {
    throw new Error('Work item not found.');
  }

  await DB.prepare(
    `UPDATE timesheet_work_category
     SET active = 0, updated_at = ?
     WHERE id = ?`,
  )
    .bind(nowMs(), id)
    .run();

  invalidateWorkCategoryCache();
}
