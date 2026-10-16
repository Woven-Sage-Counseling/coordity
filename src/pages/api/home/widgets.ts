import type { APIRoute } from 'astro';
import { canSeeCaseload, getCaseloadSnapshot } from '../../../lib/caseload';
import { canSeeCredentialing } from '../../../lib/credentialing';
import {
  bankBalanceForAccount,
  orderedBoardRefs,
  pnlAmountForAccount,
  signedNetCents,
  visibleBoardRefs,
  type DashboardAccountChoice,
} from '../../../lib/financials/cards';
import { normalizeMatchName } from '../../../lib/financials/outlook';
import { formatUsd, getFinancialSummary } from '../../../lib/financials/summary';
import type { FinancialSummary } from '../../../lib/financials/types';
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
  progress?: number;
  focus?: string;
  books?: HomeBooks;
}> {
  const title = TITLES[id];
  try {
    if (id === 'schedule') return await scheduleWidget(userId, title);
    if (id === 'my_progress') return await progressWidget(userId, orgId, roleKeys, title);
    if (id === 'quickbooks') return await quickbooksWidget(orgId, title);
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

async function progressWidget(userId: string, orgId: string, roleKeys: string[], title: string) {
  const tracks = await listProgressTracksForUser(userId, { orgId, roleKeys });
  const overall = overallProgress(tracks);
  const detail = overall.total === 0 ? 'Nothing assigned yet.' : `${overall.percent}% complete.`;
  return { id: 'my_progress' as const, title, detail, progress: overall.percent, focus: 'Overall' };
}

async function detailFor(id: HomeWidgetId, userId: string, orgId: string, _roleKeys: string[]): Promise<string> {
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
  if (id === 'tasks') {
    const tasks = await listTasksForUser(userId, 50);
    const open = tasks.filter((task) => task.completedAt == null).length;
    return open === 1 ? '1 open task.' : `${open} open tasks.`;
  }
  if (id === 'credentialing') return 'Insurance coverage by provider.';
  if (id === 'training') return 'Assigned courses.';
  return 'Open to see more.';
}

interface HomeBooks {
  period: string;
  sections: Array<{ title: string; rows: Array<{ label: string; amount: string }> }>;
}

async function quickbooksWidget(orgId: string, title: string) {
  const summary = await getFinancialSummary(null, { orgId, cachedOnly: true });
  const books = booksFromSummary(summary);
  const net = books.sections.find((section) => section.title === 'Net income')?.rows[0]?.amount;
  const detail =
    summary.quickbooks.status !== 'connected' || !summary.snapshot
      ? 'QuickBooks not connected.'
      : books.sections.length === 0
        ? 'No cards yet. Add them on the financials page.'
        : net
          ? `${net} net income.`
          : 'Snapshot.';
  return { id: 'quickbooks' as const, title, detail, books };
}

function booksFromSummary(summary: FinancialSummary): HomeBooks {
  const snapshot = summary.snapshot;
  const period = snapshot
    ? `${formatPeriod(snapshot.periodStart)} – ${formatPeriod(snapshot.periodEnd)}`
    : 'No snapshot yet';
  if (summary.quickbooks.status !== 'connected' || !snapshot) {
    return { period, sections: [] };
  }

  const enabled = summary.dashboardCards.filter((card) => card.enabled);
  if (enabled.length === 0) return { period, sections: [] };

  const activityChoices: DashboardAccountChoice[] = summary.pnlLines.map((line) => ({
    id: line.accountId || `name:${normalizeMatchName(line.name)}`,
    name: line.name,
    kind: line.bucket === 'income' ? 'income' : 'expense',
  }));
  const refs = orderedBoardRefs(visibleBoardRefs(summary.dashboardCards), summary.boardOrder);
  const sections: HomeBooks['sections'] = [];

  for (const ref of refs) {
    const card = enabled.find((item) => (ref.startsWith('income:') ? item.key === 'income_expenses' : item.key === ref));
    if (!card) continue;
    if (card.key === 'pnl') {
      sections.push({
        title: 'Profit and loss',
        rows: [
          { label: 'Income', amount: formatUsd(snapshot.revenueCents) },
          { label: 'Expenses', amount: formatUsd(summary.reportedExpensesCents) },
        ],
      });
      continue;
    }
    if (card.key === 'net_income') {
      const accountChoices = summary.pnlLines
        .filter((line) => line.accountId)
        .map((line) => ({
          id: line.accountId as string,
          name: line.name,
          kind: line.bucket === 'income' ? ('income' as const) : ('expense' as const),
        }));
      sections.push({
        title: 'Net income',
        rows: [{ label: 'Net income', amount: formatUsd(signedNetCents(summary.pnlLines, accountChoices, card.accountIds)) }],
      });
      continue;
    }
    if (card.key === 'account_balance') {
      const balances = card.accountIds.flatMap((id) => {
        const found = bankBalanceForAccount(summary.bankAccounts, [], id);
        if (!found) return [];
        return [{ label: card.labels[id] || found.name, amount: formatUsd(found.cents) }];
      });
      sections.push({
        title: 'Account balances',
        rows: balances.length > 0 ? balances : [{ label: 'Add an account', amount: '' }],
      });
      continue;
    }
    const block = card.blocks.find((item) => `income:${item.id}` === ref);
    if (!block) continue;
    const selected = activityChoices.filter((account) => block.accountIds.includes(account.id));
    const rows = selected.slice(0, 8).map((account) => ({
      label: account.name,
      amount: formatUsd(Math.abs(pnlAmountForAccount(summary.pnlLines, account))),
    }));
    sections.push({
      title: 'Income and expenses',
      rows: rows.length > 0 ? rows : [{ label: 'Choose accounts', amount: '' }],
    });
  }

  return { period, sections };
}

function formatPeriod(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
