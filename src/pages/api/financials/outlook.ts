import type { APIRoute } from 'astro';
import { formErrorRedirect } from '../../../lib/http';
import { normalizeMatchName, saveFinancialOutlook, type OutlookAccountRef, type OutlookLineInput } from '../../../lib/financials/outlook';
import { orgIdFromLocals } from '../../../lib/organization';
import { hasPermission } from '../../../lib/permissions';

export const prerender = false;

function textList(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeAccounts(accounts: OutlookAccountRef[]): OutlookAccountRef[] {
  const byName = new Map<string, OutlookAccountRef>();
  for (const account of accounts) {
    const matchName = normalizeMatchName(account.matchName);
    if (!matchName) continue;
    const existing = byName.get(matchName);
    if (!existing || (!existing.qbAccountId && account.qbAccountId)) {
      byName.set(matchName, { matchName, qbAccountId: account.qbAccountId?.trim() || null });
    }
  }
  return [...byName.values()];
}

function returnToFinancials(form: FormData): string {
  const period = String(form.get('period') ?? 'ytd');
  const params = new URLSearchParams({ period, outlook: '1' });
  if (period === 'custom') {
    const start = String(form.get('start') ?? '');
    const end = String(form.get('end') ?? '');
    if (start) params.set('start', start);
    if (end) params.set('end', end);
  }
  return `/financials?${params.toString()}#outlook`;
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasPermission(locals.employee, 'financials:manage')) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const ids = form.getAll('lineId').map((value) => String(value));
  const kinds = form.getAll('lineKind').map((value) => String(value));
  const roles = form.getAll('lineRole').map((value) => String(value));
  const labels = form.getAll('lineLabel').map((value) => String(value));
  const colors = form.getAll('lineColor').map((value) => String(value));
  const accountsLoaded = form.get('accountsLoaded') === '1';
  const typed = accountsLoaded ? [] : form.getAll('lineTyped').map((value) => String(value));
  const removed = new Set(form.getAll('remove').map((value) => String(value)));
  const picked = form.getAll('lineAccount').map((value) => String(value));

  const lines: OutlookLineInput[] = [];
  for (let index = 0; index < labels.length; index += 1) {
    const id = ids[index] ?? '';
    if (id && removed.has(id)) continue;
    const accounts: OutlookAccountRef[] = textList(typed[index] ?? '').map((matchName) => ({
      qbAccountId: null,
      matchName,
    }));
    for (const value of picked) {
      const [lineId, qbAccountId, matchName] = value.split('\t');
      if (lineId !== id || !matchName) continue;
      accounts.push({ qbAccountId: qbAccountId || null, matchName });
    }
    lines.push({
      id: id || null,
      kind: kinds[index] === 'cash' ? 'cash' : 'expense',
      role: roles[index] === 'reserve' ? 'reserve' : kinds[index] === 'cash' ? 'operating' : 'expense',
      label: labels[index] ?? '',
      color: colors[index] ?? null,
      accounts: mergeAccounts(accounts),
    });
  }

  const newExpenseLabel = String(form.get('newExpenseLabel') ?? '');
  if (newExpenseLabel.trim()) {
    const accounts: OutlookAccountRef[] = textList(accountsLoaded ? '' : form.get('newExpenseTyped')).map((matchName) => ({
      qbAccountId: null,
      matchName,
    }));
    for (const value of form.getAll('newExpenseAccount')) {
      const [qbAccountId, matchName] = String(value).split('\t');
      if (!matchName) continue;
      accounts.push({ qbAccountId: qbAccountId || null, matchName });
    }
    lines.push({
      kind: 'expense',
      role: 'expense',
      label: newExpenseLabel,
      color: String(form.get('newExpenseColor') ?? ''),
      accounts: mergeAccounts(accounts),
    });
  }

  const newCashLabel = String(form.get('newCashLabel') ?? '');
  if (newCashLabel.trim()) {
    const accounts: OutlookAccountRef[] = textList(accountsLoaded ? '' : form.get('newCashTyped')).map((matchName) => ({
      qbAccountId: null,
      matchName,
    }));
    for (const value of form.getAll('newCashAccount')) {
      const [qbAccountId, matchName] = String(value).split('\t');
      if (!matchName) continue;
      accounts.push({ qbAccountId: qbAccountId || null, matchName });
    }
    const role = String(form.get('newCashRole') ?? '') === 'reserve' ? 'reserve' : 'operating';
    lines.push({
      kind: 'cash',
      role,
      label: newCashLabel,
      color: null,
      accounts: mergeAccounts(accounts),
    });
  }

  const months = Number(form.get('reserveTargetMonths') ?? 3);
  const operationsStart = String(form.get('operationsStart') ?? '').trim() || null;

  try {
    await saveFinancialOutlook(orgIdFromLocals(locals.organization), {
      reserveTargetMonths: months,
      operationsStart,
      lines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the outlook.';
    return formErrorRedirect('/financials', message);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: returnToFinancials(form), 'Cache-Control': 'no-store' },
  });
};
