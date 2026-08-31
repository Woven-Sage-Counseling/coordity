import { randomToken, nowMs } from './crypto';
import { getEnv } from './env';
import { formatHours } from './timesheet';
import {
  getTimesheetWorkCategory,
  getTimesheetWorkCategoryLabel,
  isTimesheetWorkCategory,
  TIMESHEET_WORK_CATEGORIES,
  type TimesheetWorkCategoryKey,
} from './timesheet-categories';
import { parseHoursInput } from './timesheet';

export interface TimesheetShiftWorkItem {
  id: string;
  shiftId: string;
  category: TimesheetWorkCategoryKey;
  minutes: number;
  createdAt: number;
}

export interface TimesheetWorkBreakdownSlice {
  category: TimesheetWorkCategoryKey | 'uncategorized';
  label: string;
  minutes: number;
  hoursLabel: string;
  percent: number;
  color: string;
}

export interface TimesheetWorkBreakdown {
  start: string;
  end: string;
  totalMinutes: number;
  categorizedMinutes: number;
  uncategorizedMinutes: number;
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
    category: row.category as TimesheetWorkCategoryKey,
    minutes: row.minutes,
    createdAt: row.created_at,
  };
}

export function serializeWorkItem(item: TimesheetShiftWorkItem) {
  const category = getTimesheetWorkCategory(item.category);
  return {
    id: item.id,
    shiftId: item.shiftId,
    category: item.category,
    label: category?.label ?? item.category,
    color: category?.color ?? UNCATEGORIZED_COLOR,
    minutes: item.minutes,
    hoursLabel: formatHours(item.minutes),
  };
}

export async function listWorkItemsForShift(shiftId: string): Promise<TimesheetShiftWorkItem[]> {
  const { DB } = getEnv();
  const rows = await DB.prepare(
    `SELECT id, shift_id, category, minutes, created_at
     FROM timesheet_shift_work_item
     WHERE shift_id = ?
     ORDER BY minutes DESC, category ASC`,
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
     ORDER BY minutes DESC, category ASC`,
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

export function parseWorkItemsForm(form: FormData): Array<{ category: TimesheetWorkCategoryKey; minutes: number }> {
  const categories = form.getAll('category').map((value) => String(value).trim());
  const hours = form.getAll('hours').map((value) => String(value).trim());
  const items: Array<{ category: TimesheetWorkCategoryKey; minutes: number }> = [];
  const seen = new Set<string>();

  for (let index = 0; index < categories.length; index += 1) {
    const category = categories[index];
    const hoursValue = hours[index] ?? '';
    if (!category && !hoursValue) continue;

    if (!isTimesheetWorkCategory(category)) {
      throw new Error('Choose a valid work category.');
    }
    if (seen.has(category)) {
      throw new Error('Each work category can only be added once per shift.');
    }

    const minutes = parseHoursInput(hoursValue);
    if (minutes <= 0) {
      throw new Error('Enter hours greater than zero for each work item.');
    }

    seen.add(category);
    items.push({ category, minutes });
  }

  return items;
}

export async function setShiftWorkItems(input: {
  userId: string;
  shiftId: string;
  items: Array<{ category: TimesheetWorkCategoryKey; minutes: number }>;
}): Promise<TimesheetShiftWorkItem[]> {
  const { DB } = getEnv();
  const shift = await DB.prepare(
    `SELECT id, user_id, minutes, ended_at
     FROM timesheet_shift
     WHERE id = ? AND user_id = ?`,
  )
    .bind(input.shiftId, input.userId)
    .first<{ id: string; user_id: string; minutes: number; ended_at: number | null }>();

  if (!shift) {
    throw new Error('Shift not found.');
  }
  if (shift.ended_at == null) {
    throw new Error('End your shift before adding work items.');
  }

  const totalMinutes = input.items.reduce((sum, item) => sum + item.minutes, 0);
  if (totalMinutes > shift.minutes) {
    throw new Error('Work item hours cannot exceed the shift total.');
  }

  await DB.prepare(`DELETE FROM timesheet_shift_work_item WHERE shift_id = ?`).bind(input.shiftId).run();

  const now = nowMs();
  for (const item of input.items) {
    await DB.prepare(
      `INSERT INTO timesheet_shift_work_item (id, shift_id, category, minutes, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(randomToken(16), input.shiftId, item.category, item.minutes, now)
      .run();
  }

  return listWorkItemsForShift(input.shiftId);
}

export async function getWorkBreakdownByCategory(
  userId: string,
  range: { start: string; end: string },
): Promise<TimesheetWorkBreakdown> {
  const { DB } = getEnv();

  const [itemRows, shiftRows] = await Promise.all([
    DB.prepare(
      `SELECT wi.category, SUM(wi.minutes) AS minutes
       FROM timesheet_shift_work_item wi
       INNER JOIN timesheet_shift s ON s.id = wi.shift_id
       WHERE s.user_id = ?
         AND s.work_date >= ?
         AND s.work_date <= ?
         AND s.ended_at IS NOT NULL
       GROUP BY wi.category`,
    )
      .bind(userId, range.start, range.end)
      .all<{ category: string; minutes: number }>(),
    DB.prepare(
      `SELECT minutes
       FROM timesheet_shift
       WHERE user_id = ?
         AND work_date >= ?
         AND work_date <= ?
         AND ended_at IS NOT NULL`,
    )
      .bind(userId, range.start, range.end)
      .all<{ minutes: number }>(),
  ]);

  const totalMinutes = (shiftRows.results ?? []).reduce((sum, row) => sum + row.minutes, 0);
  const categorizedMinutes = (itemRows.results ?? []).reduce((sum, row) => sum + row.minutes, 0);
  const uncategorizedMinutes = Math.max(0, totalMinutes - categorizedMinutes);

  const slices: TimesheetWorkBreakdownSlice[] = (itemRows.results ?? [])
    .filter((row) => row.minutes > 0 && isTimesheetWorkCategory(row.category))
    .map((row) => {
      const category = row.category as TimesheetWorkCategoryKey;
      const meta = getTimesheetWorkCategory(category)!;
      return {
        category,
        label: meta.label,
        minutes: row.minutes,
        hoursLabel: formatHours(row.minutes),
        percent: totalMinutes > 0 ? Math.round((row.minutes / totalMinutes) * 1000) / 10 : 0,
        color: meta.color,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  if (uncategorizedMinutes > 0) {
    slices.push({
      category: 'uncategorized',
      label: 'Uncategorized',
      minutes: uncategorizedMinutes,
      hoursLabel: formatHours(uncategorizedMinutes),
      percent: totalMinutes > 0 ? Math.round((uncategorizedMinutes / totalMinutes) * 1000) / 10 : 0,
      color: UNCATEGORIZED_COLOR,
    });
  }

  return {
    start: range.start,
    end: range.end,
    totalMinutes,
    categorizedMinutes,
    uncategorizedMinutes,
    slices,
  };
}

export function workCategoryOptions() {
  return TIMESHEET_WORK_CATEGORIES.map((item) => ({
    key: item.key,
    label: item.label,
    color: item.color,
  }));
}

export function serializeWorkBreakdown(breakdown: TimesheetWorkBreakdown) {
  return {
    ...breakdown,
    totalLabel: formatHours(breakdown.totalMinutes),
    categorizedLabel: formatHours(breakdown.categorizedMinutes),
    uncategorizedLabel: formatHours(breakdown.uncategorizedMinutes),
    slices: breakdown.slices.map((slice) => ({
      ...slice,
      hoursLabel: formatHours(slice.minutes),
    })),
  };
}

export { getTimesheetWorkCategoryLabel };
