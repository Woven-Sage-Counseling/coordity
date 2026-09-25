import { nowMs, randomToken } from '../crypto';
import { getEnv } from '../env';
import type { FinancialTransaction } from './types';

export type OutlookKind = 'expense' | 'cash';
export type OutlookRole = 'expense' | 'operating' | 'reserve';

export interface OutlookAccountRef {
  qbAccountId: string | null;
  matchName: string;
}

export interface OutlookLine {
  id: string;
  kind: OutlookKind;
  role: OutlookRole;
  label: string;
  color: string | null;
  sortOrder: number;
  accounts: OutlookAccountRef[];
}

export interface FinancialOutlook {
  orgId: string;
  reserveTargetMonths: number;
  operationsStart: string | null;
  lines: OutlookLine[];
}

export interface StoredPnlLine {
  name: string;
  cents: number;
  accountId: string | null;
  expense: boolean;
}

export interface StoredBankLine {
  name: string;
  balanceCents: number | null;
  accountId: string | null;
  accountNumber: string | null;
}

export interface SnapshotNotes {
  pnlLines: StoredPnlLine[];
  transactions: FinancialTransaction[];
  banks: StoredBankLine[];
  qboExpenses: number | null;
  qboNet: number | null;
}

export interface OutlookLineInput {
  id?: string | null;
  kind: OutlookKind;
  role: OutlookRole;
  label: string;
  color: string | null;
  accounts: OutlookAccountRef[];
}

const EMPTY_NOTES: SnapshotNotes = {
  pnlLines: [],
  transactions: [],
  banks: [],
  qboExpenses: null,
  qboNet: null,
};

export function normalizeMatchName(name: string): string {
  return name
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^total /, '')
    .trim();
}

export function emptyOutlook(orgId: string): FinancialOutlook {
  return {
    orgId,
    reserveTargetMonths: 3,
    operationsStart: null,
    lines: [],
  };
}

export async function getFinancialOutlook(orgId: string): Promise<FinancialOutlook> {
  const { DB } = getEnv();
  const settings = await DB.prepare(
    `SELECT reserve_target_months, operations_start
     FROM financial_outlook WHERE org_id = ?`,
  )
    .bind(orgId)
    .first<{ reserve_target_months: number; operations_start: string | null }>();

  const lineRows = await DB.prepare(
    `SELECT id, kind, role, label, color, sort_order
     FROM financial_outlook_line
     WHERE org_id = ?
     ORDER BY sort_order ASC, label ASC`,
  )
    .bind(orgId)
    .all<{
      id: string;
      kind: OutlookKind;
      role: OutlookRole;
      label: string;
      color: string | null;
      sort_order: number;
    }>();

  const accountRows = await DB.prepare(
    `SELECT line_id, match_name, qb_account_id
     FROM financial_outlook_account
     WHERE org_id = ?`,
  )
    .bind(orgId)
    .all<{ line_id: string; match_name: string; qb_account_id: string | null }>();

  const accountsByLine = new Map<string, OutlookAccountRef[]>();
  for (const row of accountRows.results ?? []) {
    const list = accountsByLine.get(row.line_id) ?? [];
    list.push({ qbAccountId: row.qb_account_id, matchName: row.match_name });
    accountsByLine.set(row.line_id, list);
  }

  return {
    orgId,
    reserveTargetMonths: settings?.reserve_target_months ?? 3,
    operationsStart: settings?.operations_start ?? null,
    lines: (lineRows.results ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      role: row.role,
      label: row.label,
      color: row.color,
      sortOrder: row.sort_order,
      accounts: accountsByLine.get(row.id) ?? [],
    })),
  };
}

export function matchOutlookLine(
  lines: OutlookLine[],
  kind: OutlookKind,
  input: { name: string; accountId?: string | null; accountNumber?: string | null },
): OutlookLine | null {
  const candidates = lines.filter((line) => line.kind === kind);
  const accountId = input.accountId?.trim() || null;
  if (accountId) {
    const byId = candidates.find((line) => line.accounts.some((account) => account.qbAccountId === accountId));
    if (byId) return byId;
  }

  const nameKey = normalizeMatchName(input.name);
  const numberKey = normalizeMatchName(input.accountNumber ?? '');
  const haystack = `${nameKey} ${numberKey}`.trim();

  for (const line of candidates) {
    for (const account of line.accounts) {
      const token = account.matchName;
      if (!token) continue;
      if (nameKey === token || nameKey.endsWith(` ${token}`)) return line;
      if (/^\d+$/.test(token.replace(/ /g, '')) && haystack.includes(token)) return line;
    }
  }
  return null;
}

export function readSnapshotNotes(notes: string | null | undefined): SnapshotNotes {
  if (!notes?.startsWith('{')) return EMPTY_NOTES;
  try {
    const meta = JSON.parse(notes) as {
      qboExpenses?: number;
      qboNet?: number;
      lines?: Array<{ name?: string; cents?: number; accountId?: string | null; bucket?: string | null }>;
      transactions?: FinancialTransaction[];
      banks?: Array<{
        name?: string;
        balanceCents?: number | null;
        accountId?: string | null;
        accountNumber?: string | null;
      }>;
    };
    return {
      qboExpenses: typeof meta.qboExpenses === 'number' ? meta.qboExpenses : null,
      qboNet: typeof meta.qboNet === 'number' ? meta.qboNet : null,
      pnlLines: (meta.lines ?? []).map((line) => ({
        name: String(line.name ?? ''),
        cents: Number(line.cents ?? 0),
        accountId: line.accountId ?? null,
        expense: line.bucket != null && line.bucket !== 'income',
      })),
      transactions: meta.transactions ?? [],
      banks: (meta.banks ?? []).map((bank) => ({
        name: String(bank.name ?? ''),
        balanceCents: bank.balanceCents ?? null,
        accountId: bank.accountId ?? null,
        accountNumber: bank.accountNumber ?? null,
      })),
    };
  } catch {
    return EMPTY_NOTES;
  }
}

export function expenseTotals(input: {
  outlook: FinancialOutlook;
  incomeCents: number;
  qboExpensesCents: number;
  qboNetCents: number;
  lineCents: Map<string, number>;
}): { totalExpensesCents: number; netIncomeCents: number } {
  const expenseLines = input.outlook.lines.filter((line) => line.kind === 'expense');
  const mapped = expenseLines.reduce((sum, line) => sum + (input.lineCents.get(line.id) ?? 0), 0);
  const active = expenseLines.some((line) => (input.lineCents.get(line.id) ?? 0) !== 0);
  if (expenseLines.length > 0 && active) {
    return {
      totalExpensesCents: mapped,
      netIncomeCents: input.incomeCents - mapped,
    };
  }
  return {
    totalExpensesCents: input.qboExpensesCents,
    netIncomeCents: input.qboNetCents,
  };
}

export function centsByOutlookLine(
  outlook: FinancialOutlook,
  notes: SnapshotNotes,
): { expense: Map<string, number>; cash: Map<string, number> } {
  const expense = new Map<string, number>();
  const cash = new Map<string, number>();
  for (const line of notes.pnlLines) {
    const matched = matchOutlookLine(outlook.lines, 'expense', { name: line.name, accountId: line.accountId });
    if (!matched) continue;
    expense.set(matched.id, (expense.get(matched.id) ?? 0) + line.cents);
  }
  for (const bank of notes.banks) {
    if (bank.balanceCents == null) continue;
    const matched = matchOutlookLine(outlook.lines, 'cash', {
      name: bank.name,
      accountId: bank.accountId,
      accountNumber: bank.accountNumber,
    });
    if (!matched) continue;
    cash.set(matched.id, (cash.get(matched.id) ?? 0) + bank.balanceCents);
  }
  return { expense, cash };
}

function cleanLabel(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanColor(value: string | null): string | null {
  const color = value?.trim() ?? '';
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : null;
}

export async function saveFinancialOutlook(
  orgId: string,
  input: {
    reserveTargetMonths: number;
    operationsStart: string | null;
    lines: OutlookLineInput[];
  },
): Promise<void> {
  const months = Math.round(input.reserveTargetMonths);
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    throw new Error('Reserve target must be between 1 and 24 months.');
  }
  const operationsStart = input.operationsStart?.trim() || null;
  if (operationsStart && !/^\d{4}-\d{2}-\d{2}$/.test(operationsStart)) {
    throw new Error('Averaging start must be a date.');
  }

  let reserveSeen = false;
  const lines: OutlookLine[] = [];
  input.lines.forEach((line, index) => {
    const label = cleanLabel(line.label);
    if (!label) return;
    const kind: OutlookKind = line.kind === 'cash' ? 'cash' : 'expense';
    let role: OutlookRole = kind === 'expense' ? 'expense' : line.role === 'reserve' ? 'reserve' : 'operating';
    if (role === 'reserve') {
      if (reserveSeen) role = 'operating';
      reserveSeen = true;
    }
    const accounts: OutlookAccountRef[] = [];
    const seen = new Set<string>();
    for (const account of line.accounts) {
      const matchName = normalizeMatchName(account.matchName);
      if (!matchName || seen.has(matchName)) continue;
      seen.add(matchName);
      accounts.push({
        qbAccountId: account.qbAccountId?.trim() || null,
        matchName,
      });
    }
    lines.push({
      id: line.id?.trim() || `fol_${randomToken(8)}`,
      kind,
      role,
      label,
      color: cleanColor(line.color),
      sortOrder: index,
      accounts,
    });
  });

  const { DB } = getEnv();
  const ts = nowMs();
  const statements = [
    DB.prepare(
      `INSERT INTO financial_outlook (org_id, reserve_target_months, operations_start, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET
         reserve_target_months = excluded.reserve_target_months,
         operations_start = excluded.operations_start,
         updated_at = excluded.updated_at`,
    ).bind(orgId, months, operationsStart, ts),
    DB.prepare(`DELETE FROM financial_outlook_account WHERE org_id = ?`).bind(orgId),
    DB.prepare(`DELETE FROM financial_outlook_line WHERE org_id = ?`).bind(orgId),
  ];

  for (const line of lines) {
    statements.push(
      DB.prepare(
        `INSERT INTO financial_outlook_line (id, org_id, kind, role, label, color, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(line.id, orgId, line.kind, line.role, line.label, line.color, line.sortOrder),
    );
    for (const account of line.accounts) {
      statements.push(
        DB.prepare(
          `INSERT INTO financial_outlook_account (org_id, line_id, match_name, qb_account_id)
           VALUES (?, ?, ?, ?)`,
        ).bind(orgId, line.id, account.matchName, account.qbAccountId),
      );
    }
  }

  if (lines.length === 0) {
    statements.push(DB.prepare(`DELETE FROM financial_cash_balance WHERE org_id = ?`).bind(orgId));
  } else {
    const placeholders = lines.map(() => '?').join(', ');
    statements.push(
      DB.prepare(
        `DELETE FROM financial_cash_balance WHERE org_id = ? AND line_id NOT IN (${placeholders})`,
      ).bind(orgId, ...lines.map((line) => line.id)),
    );
  }

  await DB.batch(statements);
  await rebucketLatestSnapshot(orgId);
}

export async function rebucketLatestSnapshot(orgId: string): Promise<void> {
  const { DB } = getEnv();
  const row = await DB.prepare(
    `SELECT id, notes, revenue_cents
     FROM financial_snapshot
     WHERE org_id = ? AND source = 'quickbooks'
     ORDER BY created_at DESC
     LIMIT 1`,
  )
    .bind(orgId)
    .first<{ id: string; notes: string | null; revenue_cents: number }>();
  if (!row?.notes?.startsWith('{')) return;

  const outlook = await getFinancialOutlook(orgId);
  const parsed = readSnapshotNotes(row.notes);
  const amounts = centsByOutlookLine(outlook, parsed);
  const qboExpenses = parsed.qboExpenses ?? 0;
  const qboNet = parsed.qboNet ?? row.revenue_cents - qboExpenses;
  const totals = expenseTotals({
    outlook,
    incomeCents: row.revenue_cents,
    qboExpensesCents: qboExpenses,
    qboNetCents: qboNet,
    lineCents: amounts.expense,
  });

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.notes) as Record<string, unknown>;
  } catch {
    return;
  }
  meta.outlook = outlook.lines
    .filter((line) => line.kind === 'expense')
    .map((line) => ({ lineId: line.id, cents: amounts.expense.get(line.id) ?? 0 }));

  await DB.prepare(
    `UPDATE financial_snapshot
     SET total_expenses_cents = ?, net_income_cents = ?, notes = ?
     WHERE id = ? AND org_id = ?`,
  )
    .bind(totals.totalExpensesCents, totals.netIncomeCents, JSON.stringify(meta), row.id, orgId)
    .run();

  const ts = nowMs();
  for (const line of outlook.lines.filter((item) => item.kind === 'cash')) {
    if (!amounts.cash.has(line.id)) continue;
    await DB.prepare(
      `INSERT INTO financial_cash_balance (org_id, line_id, balance_cents, as_of_date, updated_at)
       VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(org_id, line_id) DO UPDATE SET
         balance_cents = excluded.balance_cents,
         updated_at = excluded.updated_at`,
    )
      .bind(orgId, line.id, amounts.cash.get(line.id) ?? null, ts)
      .run();
  }
}

export async function readCashBalances(orgId: string): Promise<Map<string, number | null>> {
  const rows = await getEnv()
    .DB.prepare(`SELECT line_id, balance_cents FROM financial_cash_balance WHERE org_id = ?`)
    .bind(orgId)
    .all<{ line_id: string; balance_cents: number | null }>();
  const balances = new Map<string, number | null>();
  for (const row of rows.results ?? []) balances.set(row.line_id, row.balance_cents);
  return balances;
}
