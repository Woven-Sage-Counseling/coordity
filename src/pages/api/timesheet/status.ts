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

  const onTimeOff = await isUserOnApprovedTimeOffNow(employee.id);
  const canChange = canUseTimesheet(employee) && !onTimeOff;
  let onShift = false;
  let onBreak = false;
  if (canUseTimesheet(employee)) {
    const shift = await getActiveShift(employee.id);
    onShift = shift != null;
    onBreak = shift ? isOnBreak(shift.breaks) : false;
  }

  return new Response(JSON.stringify({ ok: true, onShift, onBreak, onTimeOff, canChange }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
