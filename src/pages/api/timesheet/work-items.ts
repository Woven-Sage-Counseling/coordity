import type { APIRoute } from 'astro';
import { getTimesheetSummary, serializeTimesheetSummary } from '../../../lib/timesheet-entries';
import { parseWorkItemsForm, serializeWorkItem, setShiftWorkItems } from '../../../lib/timesheet-work-items';
import { timesheetJsonError, timesheetJsonOk, wantsJson } from '../../../lib/timesheet-http';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }

  if (!wantsJson(request)) {
    return timesheetJsonError('JSON request required.', 406);
  }

  const form = await request.formData();
  const shiftId = String(form.get('shiftId') ?? '').trim();
  if (!shiftId) {
    return timesheetJsonError('Shift is required.');
  }

  try {
    const items = parseWorkItemsForm(form);
    const workItems = await setShiftWorkItems({
      userId: employee.id,
      shiftId,
      items,
    });
    const summary = await getTimesheetSummary(employee.id);

    return timesheetJsonOk({
      shiftId,
      workItems: workItems.map(serializeWorkItem),
      summary: serializeTimesheetSummary(summary),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save work items.';
    return timesheetJsonError(message);
  }
};
