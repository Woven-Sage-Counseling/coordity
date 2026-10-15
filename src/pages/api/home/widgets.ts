import type { APIRoute } from 'astro';
import { canSeeCaseload, getCaseloadSnapshot } from '../../../lib/caseload';
import { canSeeCredentialing } from '../../../lib/credentialing';
import { getFinancialSummary } from '../../../lib/financials/summary';
import { defaultPrefs, type HomeWidgetId } from '../../../lib/home-widgets';
import { orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';
import { listProgressTracksForUser, overallProgress } from '../../../lib/progress';
import { getScheduleSummary } from '../../../lib/schedule/summary';
import type { ScheduleEvent } from '../../../lib/schedule/types';
import { listTasksForUser } from '../../../lib/tasks';
import { canUseTimesheet } from '../../../lib/timesheet-access';
import { isOnBreak } from '../../../lib/timesheet-breaks';
import { getActiveShift } from '../../../lib/timesheet-entries';
import { listTimeOffRequestsForUser } from '../../../lib/time-off-requests';

export const prerender = false;

const TITLES: Record<HomeWidgetId, string> = {
  schedule: 'Calendar',
  caseload: 'Caseload',
  time_off: 'Time off',
  timesheet: 'Timesheet',
  my_progress: 'My progress',
  tasks: 'Tasks',
  credentialing: 'Credentialing',
  quickbooks: 'QuickBooks',
  training: 'Training',
};

export const GET: APIRoute = async ({ locals }) => {
  const employee = locals.employee;
  if (!employee || employee.status !== 'active') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const orgId = orgIdFromLocals(locals.organization);
  const access = {
    canSeeFinancials: hasPermission(employee, 'financials:view'),
    canSeeCredentialing: canSeeCredentialing(employee),
    canSeeClinical: canSeeCaseload(employee),
    canSeeTimesheet: canUseTimesheet(employee),
  };
  const ids = defaultPrefs(access).enabled;
  const widgets = await Promise.all(ids.map((id) => summarize(id, employee.id, orgId, employee.roles)));

  return new Response(JSON.stringify({ ok: true, widgets }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

async function summarize(
  id: HomeWidgetId,
  userId: string,
  orgId: string,
  roleKeys: string[],
): Promise<{
  id: HomeWidgetId;
  title: string;
  detail: string;
  events?: Array<Pick<ScheduleEvent, 'title' | 'start' | 'end' | 'allDay'>>;
}> {
  const title = TITLES[id];
  try {
    if (id === 'schedule') return await scheduleWidget(userId, title);
    return { id, title, detail: await detailFor(id, userId, orgId, roleKeys) };
  } catch (error) {
    console.error('home widget', id, error);
    return { id, title, detail: 'Open to see more.' };
  }
}

async function scheduleWidget(userId: string, title: string) {
  const summary = await getScheduleSummary(userId, 'today', { preferCache: true });
  if (summary.connection.status !== 'connected') {
    return { id: 'schedule' as const, title, detail: 'Calendar not connected.' };
  }
  const events = summary.events.slice(0, 40).map((event) => ({
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
  }));
  const count = events.length;
  const detail = count === 0 ? 'Nothing scheduled today.' : count === 1 ? '1 item today.' : `${count} items today.`;
  return { id: 'schedule' as const, title, detail, events };
}

async function detailFor(id: HomeWidgetId, userId: string, orgId: string, roleKeys: string[]): Promise<string> {
  if (id === 'caseload') {
    const snapshot = getCaseloadSnapshot(userId);
    return `${snapshot.sessionsThisWeek} sessions this week.`;
  }
  if (id === 'time_off') {
    const requests = await listTimeOffRequestsForUser(userId, 8);
    const pending = requests.filter((request) => request.status === 'pending').length;
    if (pending === 0) return requests.length === 0 ? 'No requests yet.' : 'No pending requests.';
    return pending === 1 ? '1 request pending.' : `${pending} requests pending.`;
  }
  if (id === 'timesheet') {
    const shift = await getActiveShift(userId);
    if (!shift) return 'Not clocked in.';
    return isOnBreak(shift.breaks) ? 'On break.' : 'Clocked in.';
  }
  if (id === 'my_progress') {
    const tracks = await listProgressTracksForUser(userId, { orgId, roleKeys });
    const overall = overallProgress(tracks);
    return overall.total === 0 ? 'Nothing assigned yet.' : `${overall.percent}% complete.`;
  }
  if (id === 'tasks') {
    const tasks = await listTasksForUser(userId, 50);
    const open = tasks.filter((task) => task.completedAt == null).length;
    return open === 1 ? '1 open task.' : `${open} open tasks.`;
  }
  if (id === 'credentialing') return 'Insurance coverage by provider.';
  if (id === 'training') return 'Assigned courses.';
  const summary = await getFinancialSummary(null, { orgId, cachedOnly: true });
  if (summary.quickbooks.status !== 'connected' || !summary.snapshot) return 'QuickBooks not connected.';
  const dollars = Math.round(summary.snapshot.netIncomeCents / 100);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars);
  return `${formatted} net income.`;
}
