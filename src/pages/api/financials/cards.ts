import type { APIRoute } from 'astro';
import {
  addIncomeExpenseBlock,
  disableDashboardCard,
  isDashboardCardKey,
  removeIncomeExpenseBlock,
  saveDashboardCardAccounts,
  saveDashboardLayout,
  saveIncomeExpenseBlock,
  type DashboardCardKey,
  type IncomeExpensesView,
} from '../../../lib/financials/cards';
import { orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

function returnToFinancials(form: FormData, error?: string): string {
  const params = new URLSearchParams();
  const period = String(form.get('period') ?? 'ytd');
  params.set('period', period);
  if (period === 'custom') {
    const start = String(form.get('start') ?? '');
    const end = String(form.get('end') ?? '');
    if (start) params.set('start', start);
    if (end) params.set('end', end);
  }
  if (error) params.set('error', error);
  return `/financials?${params.toString()}`;
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const orgId = orgIdFromLocals(locals.organization);

  try {
    const intent = String(form.get('intent') ?? 'layout');
    const rawView = String(form.get('incomeView') ?? '');
    const incomeView: IncomeExpensesView = rawView === 'list' || rawView === 'pie' ? rawView : 'graph';
    if (intent === 'add-income') {
      await addIncomeExpenseBlock(orgId, incomeView);
    } else if (intent === 'remove-income') {
      await removeIncomeExpenseBlock(orgId, String(form.get('blockId') ?? ''));
    } else if (intent === 'remove-card') {
      const cardKey = String(form.get('cardKey') ?? '');
      if (!isDashboardCardKey(cardKey) || cardKey === 'income_expenses') {
        throw new Error('Choose a card first.');
      }
      await disableDashboardCard(orgId, cardKey);
    } else if (intent === 'accounts') {
      const cardKey = String(form.get('cardKey') ?? '');
      if (cardKey === 'income_expenses') {
        await saveIncomeExpenseBlock(
          orgId,
          String(form.get('blockId') ?? ''),
          form.getAll('accountId').map((value) => String(value)),
          incomeView,
        );
      } else if (!isDashboardCardKey(cardKey) || cardKey === 'pnl') {
        throw new Error('Choose a card first.');
      } else {
        await saveDashboardCardAccounts(
          orgId,
          cardKey,
          form.getAll('accountId').map((value) => String(value)),
          form.getAll('accountLabel').map((value) => String(value)),
        );
      }
    } else {
      const enabled = form
        .getAll('card')
        .map((value) => String(value))
        .filter((value): value is DashboardCardKey => isDashboardCardKey(value));
      await saveDashboardLayout(orgId, { enabled });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update the dashboard.';
    return new Response(null, {
      status: 303,
      headers: { Location: returnToFinancials(form, message), 'Cache-Control': 'no-store' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: returnToFinancials(form), 'Cache-Control': 'no-store' },
  });
};
