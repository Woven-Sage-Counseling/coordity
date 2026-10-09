import { nowMs } from '../crypto';
import { getEnv } from '../env';
import { normalizeMatchName } from './outlook';
import type { BankAccountLine, FinancialTransaction, PnlLine } from './types';

export const DASHBOARD_CARD_KEYS = ['pnl', 'income_expenses', 'account_balance', 'net_income'] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];
export type IncomeExpensesView = 'graph' | 'list';

export interface DashboardCard {
  key: DashboardCardKey;
  enabled: boolean;
  viewMode: IncomeExpensesView;
  accountIds: string[];
}

export interface DashboardAccountChoice {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'bank';
}

const CARD_ORDER = new Map(DASHBOARD_CARD_KEYS.map((key, index) => [key, index]));

function emptyCard(key: DashboardCardKey): DashboardCard {
  return { key, enabled: false, viewMode: 'graph', accountIds: [] };
}

function parseAccountIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((value) => String(value).trim()).filter(Boolean))].slice(0, 80);
  } catch {
    return [];
  }
}

function parseViewMode(raw: string | null): IncomeExpensesView {
  return raw === 'list' ? 'list' : 'graph';
}

export function isDashboardCardKey(value: string): value is DashboardCardKey {
  return (DASHBOARD_CARD_KEYS as readonly string[]).includes(value);
}

async function ensureDashboardCardTable(): Promise<void> {
  await getEnv()
    .DB.prepare(
      `CREATE TABLE IF NOT EXISTS financial_dashboard_card (
         org_id TEXT NOT NULL,
         card_key TEXT NOT NULL,
         enabled INTEGER NOT NULL DEFAULT 0,
         view_mode TEXT,
         account_ids TEXT NOT NULL DEFAULT '[]',
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (org_id, card_key)
       )`,
    )
    .run();
}

export async function getDashboardCards(orgId: string): Promise<DashboardCard[]> {
  try {
    await ensureDashboardCardTable();
    return await readDashboardCards(orgId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('no such table')) {
      return DASHBOARD_CARD_KEYS.map((key) => emptyCard(key));
    }
    throw error;
  }
}

async function readDashboardCards(orgId: string): Promise<DashboardCard[]> {
  const rows = await getEnv()
    .DB.prepare(
      `SELECT card_key, enabled, view_mode, account_ids
       FROM financial_dashboard_card
       WHERE org_id = ?`,
    )
    .bind(orgId)
    .all<{ card_key: string; enabled: number; view_mode: string | null; account_ids: string }>();

  const byKey = new Map<DashboardCardKey, DashboardCard>();
  for (const key of DASHBOARD_CARD_KEYS) byKey.set(key, emptyCard(key));
  for (const row of rows.results ?? []) {
    if (!isDashboardCardKey(row.card_key)) continue;
    byKey.set(row.card_key, {
      key: row.card_key,
      enabled: row.enabled === 1,
      viewMode: parseViewMode(row.view_mode),
      accountIds: parseAccountIds(row.account_ids),
    });
  }
  return [...byKey.values()].sort((a, b) => (CARD_ORDER.get(a.key) ?? 0) - (CARD_ORDER.get(b.key) ?? 0));
}

export async function saveDashboardLayout(
  orgId: string,
  input: { enabled: DashboardCardKey[]; incomeView: IncomeExpensesView },
): Promise<void> {
  const enabled = new Set(input.enabled);
  await ensureDashboardCardTable();
  const { DB } = getEnv();
  const ts = nowMs();
  const statements = DASHBOARD_CARD_KEYS.map((key) =>
    DB.prepare(
      `INSERT INTO financial_dashboard_card (org_id, card_key, enabled, view_mode, account_ids, updated_at)
       VALUES (?, ?, ?, ?, '[]', ?)
       ON CONFLICT(org_id, card_key) DO UPDATE SET
         enabled = excluded.enabled,
         view_mode = CASE
           WHEN excluded.card_key = 'income_expenses' THEN excluded.view_mode
           ELSE financial_dashboard_card.view_mode
         END,
         updated_at = excluded.updated_at`,
    ).bind(orgId, key, enabled.has(key) ? 1 : 0, key === 'income_expenses' ? input.incomeView : null, ts),
  );
  await DB.batch(statements);
}

export async function saveDashboardCardAccounts(
  orgId: string,
  cardKey: DashboardCardKey,
  accountIds: string[],
): Promise<void> {
  const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))].slice(0, 80);
  await ensureDashboardCardTable();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO financial_dashboard_card (org_id, card_key, enabled, view_mode, account_ids, updated_at)
     VALUES (?, ?, 1, NULL, ?, ?)
     ON CONFLICT(org_id, card_key) DO UPDATE SET
       account_ids = excluded.account_ids,
       enabled = 1,
       updated_at = excluded.updated_at`,
  )
    .bind(orgId, cardKey, JSON.stringify(ids), nowMs())
    .run();
}

export function pnlAmountForAccount(lines: PnlLine[], account: DashboardAccountChoice): number {
  const nameKey = normalizeMatchName(account.name);
  const match = lines.find((line) => {
    if (account.id && line.accountId === account.id) return true;
    return normalizeMatchName(line.name) === nameKey;
  });
  return match?.cents ?? 0;
}

export function signedNetCents(lines: PnlLine[], accounts: DashboardAccountChoice[], selectedIds: string[]): number | null {
  if (selectedIds.length === 0) return null;
  const selected = new Set(selectedIds);
  let total = 0;
  for (const account of accounts) {
    if (!selected.has(account.id) || account.kind === 'bank') continue;
    const amount = Math.abs(pnlAmountForAccount(lines, account));
    total += account.kind === 'income' ? amount : -amount;
  }
  return total;
}

export function transactionsForAccounts(
  transactions: FinancialTransaction[],
  accounts: DashboardAccountChoice[],
  selectedIds: string[],
): FinancialTransaction[] {
  const selected = new Set(selectedIds);
  const names = new Set(
    accounts
      .filter((account) => selected.has(account.id))
      .map((account) => normalizeMatchName(account.name))
      .filter(Boolean),
  );
  if (names.size === 0) return [];
  return transactions.filter((transaction) => names.has(normalizeMatchName(transaction.accountName)));
}

export function bankBalanceForAccount(
  banks: BankAccountLine[],
  accounts: DashboardAccountChoice[],
  accountId: string | null,
): { name: string; cents: number | null } | null {
  if (!accountId) return null;
  const account = accounts.find((item) => item.id === accountId);
  const nameKey = normalizeMatchName(account?.name ?? '');
  const bank = banks.find((item) => {
    if (item.accountId && item.accountId === accountId) return true;
    return nameKey.length > 0 && normalizeMatchName(item.name) === nameKey;
  });
  return {
    name: account?.name ?? bank?.name ?? 'Account',
    cents: bank?.balanceCents ?? null,
  };
}
