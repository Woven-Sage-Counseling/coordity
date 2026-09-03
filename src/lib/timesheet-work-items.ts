import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { formatHours } from './timesheet';
import {
  getWorkCategoryLookup,
  type WorkCategoryLookup,
  type WorkCategoryMeta,
} from './timesheet-work-categories';

/** Each row marks that a category was worked during that shift (not hour allocation). */
export const WORK_ITEM_OCCURRENCE = 1;

export interface TimesheetShiftWorkItem {
  id: string;
  shiftId: string;
  category: string;
  minutes: number;
  createdAt: number;
}

export interface TimesheetWorkBreakdownSlice {
  category: string;
  label: string;
  count: number;
  frequencyLabel: string;
  percent: number;
  color: string;
}

export interface TimesheetWorkBreakdown {
  start: string;
  end: string;
  totalShiftMinutes: number;
  taggedShiftCount: number;
  untaggedShiftCount: number;
  totalOccurrences: number;
  slices: TimesheetWorkBreakdownSlice[];
}

type WorkItemRow = {
  id: string;
  shift_id: string;
  category: string;
  minutes: number;
  created_at: number;
};

const UNCATEGORIZED_COLOR = '#9ca3af';

function mapWorkItem(row: WorkItemRow): TimesheetShiftWorkItem {
  return {
    id: row.id,
    shiftId: row.shift_id,
    category: row.category,
    minutes: row.minutes,
    createdAt: row.created_at,
  };
}

function formatFrequencyLabel(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

export function serializeWorkItem(
  item: TimesheetShiftWorkItem,
  lookup: WorkCategoryLookup,
) {
  const category = lookup.get(item.category);
  return {
    id: item.id,
    shiftId: item.shiftId,
    category: item.category,
    label: category?.label ?? item.category,
    color: category?.color ?? UNCATEGORIZED_COLOR,
    minutes: item.minutes,
  };
}

export async function listWorkItemsForShift(shiftId: string): Promise<TimesheetShiftWorkItem[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, shift_id, category, minutes, created_at
     FROM timesheet_shift_work_item
     WHERE shift_id = ?
     ORDER BY category ASC`,
  )
    .bind(shiftId)
    .all<WorkItemRow>();

  return (rows.results ?? []).map(mapWorkItem);
}

export async function listWorkItemsForShifts(
  shiftIds: string[],
): Promise<Map<string, TimesheetShiftWorkItem[]>> {
  const map = new Map<string, TimesheetShiftWorkItem[]>();
  if (shiftIds.length === 0) return map;

  const { DB } = getEnv();
  const placeholders = shiftIds.map(() => '?').join(', ');
  const rows = await DB.prepare(
    `SELECT id, shift_id, category, minutes, created_at
     FROM timesheet_shift_work_item
     WHERE shift_id IN (${placeholders})
     ORDER BY category ASC`,
  )
    .bind(...shiftIds)
    .all<WorkItemRow>();

  for (const row of rows.results ?? []) {
    const item = mapWorkItem(row);
    const existing = map.get(item.shiftId) ?? [];
    existing.push(item);
    map.set(item.shiftId, existing);
  }

  return map;
}

export function parseWorkItemsForm(
  form: FormData,
  lookup: WorkCategoryLookup,
): Array<{ category: string }> {
  const categories = form
    .getAll('category')
    .map((value) => String(value).trim())
    .filter(Boolean);
  const items: Array<{ category: string }> = [];
  const seen = new Set<string>();

  for (const category of categories) {
    if (!lookup.has(category)) {
      throw new Error('Choose valid work categories.');
    }
    if (seen.has(category)) continue;
    seen.add(category);
    items.push({ category });
  }

  return items;
}

export async function setShiftWorkItems(input: {
  userId: string;
  shiftId: string;
  items: Array<{ category: string }>;
}): Promise<TimesheetShiftWorkItem[]> {
  const { DB } = getEnv();
  const shift = await DB.prepare(
    `SELECT id, user_id, ended_at
     FROM timesheet_shift
     WHERE id = ? AND user_id = ?`,
  )
    .bind(input.shiftId, input.userId)
    .first<{ id: string; user_id: string; ended_at: number | null }>();

  if (!shift) {
    throw new Error('Shift not found.');
  }
  if (shift.ended_at == null) {
    throw new Error('End your shift before logging work items.');
  }

  await DB.prepare(`DELETE FROM timesheet_shift_work_item WHERE shift_id = ?`).bind(input.shiftId).run();

  const now = nowMs();
  for (const item of input.items) {
    await DB.prepare(
      `INSERT INTO timesheet_shift_work_item (id, shift_id, category, minutes, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(randomToken(16), input.shiftId, item.category, WORK_ITEM_OCCURRENCE, now)
      .run();
  }

  return listWorkItemsForShift(input.shiftId);
}

export async function getWorkBreakdownByCategory(
  userId: string,
  range: { start: string; end: string },
): Promise<TimesheetWorkBreakdown> {
  const { DB } = getEnv();
  const lookup = await getWorkCategoryLookup();

  const [itemRows, shiftRows] = await Promise.all([
    DB.prepare(
      `SELECT wi.category, COUNT(*) AS occurrence_count
       FROM timesheet_shift_work_item wi
       INNER JOIN timesheet_shift s ON s.id = wi.shift_id
       WHERE s.user_id = ?
         AND s.work_date >= ?
         AND s.work_date <= ?
         AND s.ended_at IS NOT NULL
       GROUP BY wi.category`,
    )
      .bind(userId, range.start, range.end)
      .all<{ category: string; occurrence_count: number }>(),
    DB.prepare(
      `SELECT s.id, s.minutes,
        EXISTS (
          SELECT 1 FROM timesheet_shift_work_item wi WHERE wi.shift_id = s.id
        ) AS has_items
       FROM timesheet_shift s
       WHERE s.user_id = ?
         AND s.work_date >= ?
         AND s.work_date <= ?
         AND s.ended_at IS NOT NULL`,
    )
      .bind(userId, range.start, range.end)
      .all<{ id: string; minutes: number; has_items: number }>(),
  ]);

  const shifts = shiftRows.results ?? [];
  const totalShiftMinutes = shifts.reduce((sum, row) => sum + row.minutes, 0);
  const taggedShiftCount = shifts.filter((row) => row.has_items === 1).length;
  const untaggedShiftCount = shifts.length - taggedShiftCount;

  const slices: TimesheetWorkBreakdownSlice[] = (itemRows.results ?? [])
    .filter((row) => row.occurrence_count > 0)
    .map((row) => {
      const meta = lookup.get(row.category);
      const count = row.occurrence_count;
      return {
        category: row.category,
        label: meta?.label ?? row.category,
        count,
        frequencyLabel: formatFrequencyLabel(count),
        percent: 0,
        color: meta?.color ?? UNCATEGORIZED_COLOR,
      };
    })
    .sort((a, b) => b.count - a.count);

  const totalOccurrences = slices.reduce((sum, slice) => sum + slice.count, 0);
  for (const slice of slices) {
    slice.percent =
      totalOccurrences > 0 ? Math.round((slice.count / totalOccurrences) * 1000) / 10 : 0;
  }

  return {
    start: range.start,
    end: range.end,
    totalShiftMinutes,
    taggedShiftCount,
    untaggedShiftCount,
    totalOccurrences,
    slices,
  };
}

export async function workCategoryOptions(): Promise<WorkCategoryMeta[]> {
  const lookup = await getWorkCategoryLookup();
  return lookup.list();
}

export function serializeWorkBreakdown(breakdown: TimesheetWorkBreakdown) {
  return {
    ...breakdown,
    totalHoursLabel: formatHours(breakdown.totalShiftMinutes),
    slices: breakdown.slices.map((slice) => ({
      ...slice,
      minutes: slice.count,
      hoursLabel: slice.frequencyLabel,
    })),
  };
}

export function getWorkCategoryLabel(key: string, lookup: WorkCategoryLookup): string {
  return lookup.get(key)?.label ?? key;
}
