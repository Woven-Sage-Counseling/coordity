import { nowMs } from '../crypto';
import { getEnv } from '../env';
import { normalizeMatchName } from './outlook';
import type { BankAccountLine, FinancialTransaction, PnlLine } from './types';

export const DASHBOARD_CARD_KEYS = ['pnl', 'income_expenses', 'account_balance', 'net_income'] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];
export type IncomeExpensesView = 'graph' | 'pie' | 'list';

export interface IncomeExpenseBlock {
  id: string;
  viewMode: IncomeExpensesView;
  accountIds: string[];
}

export interface DashboardCard {
  key: DashboardCardKey;
  enabled: boolean;
  viewMode: IncomeExpensesView;
  accountIds: string[];
  labels: Record<string, string>;
  blocks: IncomeExpenseBlock[];
}

export interface DashboardAccountChoice {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'bank';
}

const CARD_ORDER = new Map(DASHBOARD_CARD_KEYS.map((key, index) => [key, index]));

function emptyCard(key: DashboardCardKey): DashboardCard {
  return { key, enabled: false, viewMode: 'graph', accountIds: [], labels: {}, blocks: [] };
}

const MAX_INCOME_BLOCKS = 12;

function parseIncomeBlocks(raw: string | null, viewMode: IncomeExpensesView, enabled: boolean): IncomeExpenseBlock[] {
  let parsed: unknown = [];
  try {
    parsed = raw ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return enabled ? [{ id: 'main', viewMode, accountIds: [] }] : [];

  const blocks: IncomeExpenseBlock[] = [];
  const legacyIds: string[] = [];
  let sawBlock = false;
  for (const item of parsed) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (id && !legacyIds.includes(id)) legacyIds.push(id);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as { id?: unknown; view?: unknown; accounts?: unknown };
    if (Array.isArray(record.accounts) || typeof record.view === 'string') {
      sawBlock = true;
      const id = String(record.id ?? '').trim() || `block-${blocks.length + 1}`;
      if (blocks.some((block) => block.id === id)) continue;
      const accountIds: string[] = [];
      if (Array.isArray(record.accounts)) {
        for (const value of record.accounts) {
          const accountId = String(value ?? '').trim();
          if (accountId && !accountIds.includes(accountId)) accountIds.push(accountId);
        }
      }
      blocks.push({
        id,
        viewMode: parseViewMode(typeof record.view === 'string' ? record.view : null),
        accountIds: accountIds.slice(0, 80),
      });
      continue;
    }
    const id = String((record as { id?: unknown }).id ?? '').trim();
    if (id && !legacyIds.includes(id)) legacyIds.push(id);
  }

  if (sawBlock) return blocks.slice(0, MAX_INCOME_BLOCKS);
  if (!enabled) return [];
  return [{ id: 'main', viewMode, accountIds: legacyIds.slice(0, 80) }];
}

async function writeIncomeBlocks(orgId: string, blocks: IncomeExpenseBlock[]): Promise<void> {
  const stored = blocks.slice(0, MAX_INCOME_BLOCKS).map((block) => ({
    id: block.id,
    view: block.viewMode,
    accounts: block.accountIds.slice(0, 80),
  }));
  await ensureDashboardCardTable();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO financial_dashboard_card (org_id, card_key, enabled, view_mode, account_ids, updated_at)
     VALUES (?, 'income_expenses', ?, ?, ?, ?)
     ON CONFLICT(org_id, card_key) DO UPDATE SET
       enabled = excluded.enabled,
       view_mode = excluded.view_mode,
       account_ids = excluded.account_ids,
       updated_at = excluded.updated_at`,
  )
    .bind(orgId, stored.length > 0 ? 1 : 0, stored[0]?.view ?? 'graph', JSON.stringify(stored), nowMs())
    .run();
}

async function incomeBlocksFor(orgId: string): Promise<IncomeExpenseBlock[]> {
  const cards = await getDashboardCards(orgId);
  return cards.find((card) => card.key === 'income_expenses')?.blocks ?? [];
}

function parseStoredAccounts(raw: string | null): { ids: string[]; labels: Record<string, string> } {
  const ids: string[] = [];
  const labels: Record<string, string> = {};
  if (!raw) return { ids, labels };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { ids, labels };
    for (const item of parsed) {
      if (typeof item === 'string') {
        const id = item.trim();
        if (!id || ids.includes(id)) continue;
        ids.push(id);
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const record = item as { id?: unknown; label?: unknown };
      const id = String(record.id ?? '').trim();
      if (!id || ids.includes(id)) continue;
      ids.push(id);
      const label = String(record.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (label) labels[id] = label;
    }
  } catch {
    return { ids: [], labels: {} };
  }
  return { ids: ids.slice(0, 80), labels };
}

function parseViewMode(raw: string | null): IncomeExpensesView {
  if (raw === 'list' || raw === 'pie') return raw;
  return 'graph';
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
    const viewMode = parseViewMode(row.view_mode);
    const blocks =
      row.card_key === 'income_expenses' ? parseIncomeBlocks(row.account_ids, viewMode, row.enabled === 1) : [];
    const stored = row.card_key === 'income_expenses' ? { ids: [] as string[], labels: {} } : parseStoredAccounts(row.account_ids);
    byKey.set(row.card_key, {
      key: row.card_key,
      enabled: row.card_key === 'income_expenses' ? blocks.length > 0 : row.enabled === 1,
      viewMode: blocks[0]?.viewMode ?? viewMode,
      accountIds: row.card_key === 'income_expenses' ? blocks.flatMap((block) => block.accountIds) : stored.ids,
      labels: stored.labels,
      blocks,
    });
  }
  return [...byKey.values()].sort((a, b) => (CARD_ORDER.get(a.key) ?? 0) - (CARD_ORDER.get(b.key) ?? 0));
}

export async function saveDashboardLayout(orgId: string, input: { enabled: DashboardCardKey[] }): Promise<void> {
  const enabled = new Set(input.enabled);
  await ensureDashboardCardTable();
  const { DB } = getEnv();
  const ts = nowMs();
  const statements = DASHBOARD_CARD_KEYS.filter((key) => key !== 'income_expenses').map((key) =>
    DB.prepare(
      `INSERT INTO financial_dashboard_card (org_id, card_key, enabled, view_mode, account_ids, updated_at)
       VALUES (?, ?, ?, NULL, '[]', ?)
       ON CONFLICT(org_id, card_key) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    ).bind(orgId, key, enabled.has(key) ? 1 : 0, ts),
  );
  await DB.batch(statements);
}

export async function addIncomeExpenseBlock(orgId: string, viewMode: IncomeExpensesView): Promise<void> {
  const blocks = await incomeBlocksFor(orgId);
  if (blocks.length >= MAX_INCOME_BLOCKS) {
    throw new Error('You can add up to 12 income and expense blocks.');
  }
  blocks.push({ id: crypto.randomUUID(), viewMode, accountIds: [] });
  await writeIncomeBlocks(orgId, blocks);
}

export async function removeIncomeExpenseBlock(orgId: string, blockId: string): Promise<void> {
  const blocks = (await incomeBlocksFor(orgId)).filter((block) => block.id !== blockId);
  await writeIncomeBlocks(orgId, blocks);
}

export async function saveIncomeExpenseBlock(
  orgId: string,
  blockId: string,
  accountIds: string[],
  viewMode: IncomeExpensesView,
): Promise<void> {
  const blocks = await incomeBlocksFor(orgId);
  const block = blocks.find((item) => item.id === blockId);
  if (!block) throw new Error('That block is no longer on the dashboard.');
  const ids: string[] = [];
  for (const raw of accountIds) {
    const id = raw.trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  block.accountIds = ids.slice(0, 80);
  block.viewMode = viewMode;
  await writeIncomeBlocks(orgId, blocks);
}

export async function saveDashboardCardAccounts(
  orgId: string,
  cardKey: DashboardCardKey,
  accountIds: string[],
  accountLabels: string[] = [],
): Promise<void> {
  const ids: string[] = [];
  const labels: Record<string, string> = {};
  accountIds.forEach((raw, index) => {
    const id = raw.trim();
    if (!id || ids.includes(id)) return;
    ids.push(id);
    const label = String(accountLabels[index] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (label) labels[id] = label;
  });
  const stored =
    cardKey === 'account_balance'
      ? ids.slice(0, 80).map((id) => (labels[id] ? { id, label: labels[id] } : id))
      : ids.slice(0, 80);
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
    .bind(orgId, cardKey, JSON.stringify(stored), nowMs())
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
