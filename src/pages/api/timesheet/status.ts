import type { APIRoute } from 'astro';
import { canUseTimesheet } from '../../../lib/timesheet-access';
import { isOnBreak } from '../../../lib/timesheet-breaks';
import { getActiveShift } from '../../../lib/timesheet-entries';
import { isUserOnApprovedTimeOffNow } from '../../../lib/time-off-requests';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  let onTimeOff = false;
  try {
    onTimeOff = await isUserOnApprovedTimeOffNow(employee.id);
  } catch (error) {
    console.error('availability time off failed', error);
  }
  const canUse = canUseTimesheet(employee);
  const canChange = canUse && !onTimeOff;
  let onShift = false;
  let onBreak = false;
  let startedAt: number | null = null;
  let breaks: Array<{ startedAt: number; endedAt: number | null }> = [];
  if (canUse) {
    try {
      const shift = await getActiveShift(employee.id);
      onShift = shift != null;
      onBreak = shift ? isOnBreak(shift.breaks) : false;
      startedAt = shift?.startedAt ?? null;
      breaks = (shift?.breaks ?? []).map((item) => ({
        startedAt: item.startedAt,
        endedAt: item.endedAt,
      }));
    } catch (error) {
      console.error('availability shift failed', error);
    }
  }

  return new Response(JSON.stringify({ ok: true, onShift, onBreak, onTimeOff, canChange, startedAt, breaks }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
