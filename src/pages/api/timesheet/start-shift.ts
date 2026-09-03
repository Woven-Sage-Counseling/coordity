import type { APIRoute } from 'astro';
import { getTimesheetSummary, serializeTimesheetSummary, startShift } from '../../../lib/timesheet-entries';
import { getWorkCategoryLookup } from '../../../lib/timesheet-work-categories';
import {
  resolveTimesheetReturnTo,
  timesheetErrorResponse,
  timesheetJsonOk,
  wantsJson,
} from '../../../lib/timesheet-http';
import { requireTimesheetAccess } from '../../../lib/timesheet-access';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireTimesheetAccess(locals.employee);
  if (denied) return denied;
  const employee = locals.employee!;

  const form = await request.formData();

  try {
    await startShift(employee.id);
    const summary = await getTimesheetSummary(employee.id);

    const categoryLookup = await getWorkCategoryLookup();
    if (wantsJson(request)) {
      return timesheetJsonOk({
        summary: serializeTimesheetSummary(summary, { categoryLookup }),
      });
    }

    return new Response(null, {
      status: 303,
      headers: { Location: resolveTimesheetReturnTo(form, '/timesheet?started=1') },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to start your shift.';
    return timesheetErrorResponse(request, form, message);
  }
};
