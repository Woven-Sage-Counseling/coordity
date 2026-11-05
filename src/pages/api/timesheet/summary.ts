import type { APIRoute } from 'astro';
import { requireTimesheetAccess } from '../../../lib/timesheet-access';
import {
  getTimesheetSummary,
  serializeTimesheetShift,
  serializeTimesheetSummary,
} from '../../../lib/timesheet-entries';
import { listPendingShiftEditShiftIds } from '../../../lib/timesheet-shift-edits';
import { resolveTimesheetPeriod } from '../../../lib/timesheet-periods';
import { formatWorkDate } from '../../../lib/timesheet';
import { getWorkCategoryLookup } from '../../../lib/timesheet-work-categories';
import { isUserOnApprovedTimeOffNow } from '../../../lib/time-off-requests';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const employee = locals.employee;
  const denied = requireTimesheetAccess(employee);
  if (denied) {
    const message = denied.status === 401 ? 'Unauthorized' : 'Forbidden';
    return new Response(JSON.stringify({ error: message }), {
      status: denied.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  if (!employee) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const params = url.searchParams.has('period') ? url.searchParams : new URLSearchParams('period=this_month');
  const period = resolveTimesheetPeriod(params);
  const [summary, categoryLookup, pendingEditShiftIds, onTimeOff] = await Promise.all([
    getTimesheetSummary(employee.id, { logStart: period.start, logEnd: period.end, logLimit: 200 }),
    getWorkCategoryLookup(),
    listPendingShiftEditShiftIds(employee.id),
    isUserOnApprovedTimeOffNow(employee.id).catch(() => false),
  ]);
  const serialized = serializeTimesheetSummary(summary, { pendingEditShiftIds, categoryLookup });
  const active = summary.activeShift
    ? serializeTimesheetShift(summary.activeShift, {
        pendingEdit: pendingEditShiftIds.has(summary.activeShift.id),
        categoryLookup,
      })
    : null;

  return new Response(
    JSON.stringify({
      ok: true,
      periodId: period.id,
      periodLabel: `${formatWorkDate(period.start, { weekday: false })} – ${formatWorkDate(period.end, { weekday: false })}`,
      weekTotalLabel: serialized.week.totalLabel,
      weekLabel: `${formatWorkDate(serialized.week.start, { weekday: false })} – ${formatWorkDate(serialized.week.end, { weekday: false })}`,
      weeklyAverageLabel: serialized.weeklyAverageLabel,
      onTimeOff,
      active: active
        ? {
            onBreak: active.onBreak,
            timeLabel: active.timeLabel,
            startedAt: active.startedAt,
          }
        : null,
      entries: serialized.entries.map((entry) => ({
        id: entry.id,
        dateLabel: entry.dateLabel,
        timeLabel: entry.timeLabel,
        hoursLabel: entry.hoursLabel,
        pausesLabel: entry.pausesLabel,
        notes: entry.notes ?? '',
        source: entry.source,
        isActive: entry.isActive,
        hasPendingEdit: entry.hasPendingEdit,
      })),
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    },
  );
};
