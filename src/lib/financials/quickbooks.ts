import { getEnv, qbApiEnvironment } from '../env';
import { nowMs, randomToken } from '../crypto';
import { classifyBank, classifyExpense } from './account-map';
import { resolvePreset, todayEastern } from './periods';
import type { FinancialDataProvider, FinancialSnapshot, FinancialTransaction } from './types';

const INTUIT_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const OAUTH_STATE_PREFIX = 'qb-oauth:';
const CONNECTION_ID = 'default';

type QbEnvironment = 'sandbox' | 'production';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
}

interface ConnectionRow {
  realm_id: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: number | null;
  refresh_token_expires_at: number | null;
  connected_by: string | null;
  status: 'disconnected' | 'connected' | 'error';
}

interface QbCol {
  id?: string;
  value?: string;
}

interface QbRow {
  type?: string;
  group?: string;
  ColData?: QbCol[];
  Header?: { ColData?: QbCol[] };
  Summary?: { ColData?: QbCol[] };
  Rows?: { Row?: QbRow | QbRow[] };
}

interface QbReportColumn {
  ColType?: string;
}

function buildColumnIndex(report: { Columns?: { Column?: QbReportColumn | QbReportColumn[] } }): Map<string, number> {
  const index = new Map<string, number>();
  for (const [position, column] of asRows(report.Columns?.Column).entries()) {
    if (column.ColType) index.set(column.ColType, position);
  }
  return index;
}

function reportColValue(cols: QbCol[], index: Map<string, number>, type: string, fallback: number): string | undefined {
  const position = index.get(type) ?? fallback;
  return cols[position]?.value;
}

function looksLikeDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) return true;
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(trimmed)) return true;
  if (/^[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}$/.test(trimmed)) return true;
  return false;
}

function normalizeAccountKey(name: string): string {
  return name
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/^total\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAccountBucket(
  accountName: string,
  accountBuckets: Map<string, FinancialTransaction['bucket']>,
  inExpense: boolean,
): FinancialTransaction['bucket'] {
  const direct = accountBuckets.get(accountName);
  if (direct) return direct;

  const normalized = normalizeAccountKey(accountName);
  for (const [name, bucket] of accountBuckets) {
    if (normalizeAccountKey(name) === normalized) return bucket;
  }

  return classifyExpense(accountName) ?? (inExpense ? 'other' : 'income');
}

function isTransactionRow(row: QbRow): boolean {
  if (row.type === 'Data') return true;
  return Boolean(row.ColData?.length && asRows(row.Rows?.Row).length === 0);
}

function isAccountHeader(row: QbRow, name: string, nestedCount: number): boolean {
  if (!name || isStructuralAccount(name) || /^total\b/i.test(name)) return false;
  return row.type === 'Section' || nestedCount > 0;
}

function reportAmount(cols: QbCol[], columnIndex: Map<string, number>): number {
  for (const type of ['subt_nat_amount', 'net_amount', 'debt_amt', 'credit_amt'] as const) {
    const value = reportColValue(cols, columnIndex, type, -1);
    if (value != null && String(value).trim() !== '') {
      return dollarsToCents(value);
    }
  }
  return firstMoney(cols) ?? 0;
}

function apiHost(environment: QbEnvironment): string {
  return environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function qbEnvironment(): QbEnvironment {
  return qbApiEnvironment();
}

function dollarsToCents(value: string | number | undefined): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  let raw = String(value).trim().replace(/[$,]/g, '');
  const negative = /^\(.*\)$/.test(raw) || raw.endsWith('-');
  raw = raw.replace(/[()]/g, '').replace(/-$/, '');
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  const cents = Math.round(parsed * 100);
  return negative ? -cents : cents;
}

function asRows<T>(row?: T | T[]): T[] {
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

function firstMoney(cols?: QbCol[]): number | null {
  if (!cols?.length) return null;
  const last = cols[cols.length - 1]?.value;
  if (last == null || String(last).trim() === '') return null;
  return dollarsToCents(last);
}

function rowAmount(row: QbRow): number {
  return firstMoney(row.Summary?.ColData) ?? firstMoney(row.ColData) ?? firstMoney(row.Header?.ColData) ?? 0;
}

function rowName(row: QbRow): string {
  return (row.ColData?.[0]?.value ?? row.Header?.ColData?.[0]?.value ?? row.Summary?.ColData?.[0]?.value ?? '').trim();
}

function isStructuralAccount(name: string): boolean {
  const key = name.toLowerCase().replace(/^total\s+/, '');
  return /^(income|other income|cost of goods sold|cogs|gross profit|expenses|other expenses|net operating income|net other income|net income|ordinary income\/expenses|ordinary income)$/.test(
    key,
  );
}

function parsePnl(rows: QbRow[]): {
  income: number;
  expenses: number;
  net: number;
  leaves: Map<string, { cents: number; expense: boolean }>;
} {
  const groups: Partial<Record<string, number>> = {};
  const named = new Map<string, number>();
  const leaves = new Map<string, { cents: number; expense: boolean }>();
  let expenseData = 0;

  function walk(list: QbRow[], inExpense: boolean): void {
    for (const row of list) {
      const group = row.group ?? '';
      const name = rowName(row);
      const amount = rowAmount(row);
      const nextExpense = inExpense || group === 'Expenses' || group === 'OtherExpenses' || group === 'COGS';

      if (group && groups[group] == null) groups[group] = amount;
      if (name) named.set(name.toLowerCase(), amount);

      const nested = asRows(row.Rows?.Row);
      const accountName = Boolean(name && !isStructuralAccount(name) && !/^total\b/i.test(name));
      if (accountName) {
        const previous = leaves.get(name);
        leaves.set(name, {
          cents: (previous?.cents ?? 0) + amount,
          expense: previous?.expense || nextExpense,
        });
      }

      if (nested.length > 0) {
        walk(nested, nextExpense);
        continue;
      }

      if (accountName && nextExpense) expenseData += amount;
    }
  }

  walk(rows, false);

  const income = (groups.Income ?? 0) + (groups.OtherIncome ?? 0) || named.get('total income') || 0;
  const expensesFromGroups = (groups.Expenses ?? 0) + (groups.OtherExpenses ?? 0) + (groups.COGS ?? 0);
  const expenses = expensesFromGroups || named.get('total expenses') || expenseData;
  const net = groups.NetIncome ?? named.get('net income') ?? income - expenses;

  return { income, expenses, net, leaves };
}

function parsePnlDetail(
  rows: QbRow[],
  columnIndex: Map<string, number>,
  accountBuckets: Map<string, FinancialTransaction['bucket']>,
): FinancialTransaction[] {
  const transactions: FinancialTransaction[] = [];
  const seen = new Set<string>();

  function walk(list: QbRow[], currentAccount: string | null, inExpense: boolean): void {
    for (const row of list) {
      const group = row.group ?? '';
      const name = rowName(row);
      const nested = asRows(row.Rows?.Row);
      const nextExpense = inExpense || group === 'Expenses' || group === 'OtherExpenses' || group === 'COGS';
      let nextAccount = currentAccount;

      if (isAccountHeader(row, name, nested.length)) {
        nextAccount = name;
      }

      if (nested.length > 0) {
        walk(nested, nextAccount, nextExpense);
        continue;
      }

      if (!isTransactionRow(row) || !nextAccount) continue;

      const accountName = nextAccount.slice(0, 200);
      const cols = row.ColData ?? [];
      const date = reportColValue(cols, columnIndex, 'tx_date', 0)?.trim() || null;
      if (!looksLikeDate(date)) continue;

      const amount = reportAmount(cols, columnIndex);
      if (amount === 0) continue;

      const type = reportColValue(cols, columnIndex, 'txn_type', 1)?.trim() || null;
      const docNum = reportColValue(cols, columnIndex, 'doc_num', 2)?.trim() || null;
      const displayName = (reportColValue(cols, columnIndex, 'name', 3) ?? type ?? accountName)
        .trim()
        .slice(0, 200);
      const memo = reportColValue(cols, columnIndex, 'memo', 4)?.trim() || null;
      const bucket = resolveAccountBucket(accountName, accountBuckets, nextExpense);

      const key = `${date}|${type ?? ''}|${docNum ?? ''}|${accountName}|${amount}|${displayName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      transactions.push({
        date,
        type,
        docNum,
        name: displayName || accountName,
        memo: memo ? memo.slice(0, 300) : null,
        accountName,
        cents: amount,
        bucket,
      });
    }
  }

  walk(rows, null, false);
  return transactions;
}

function parseGeneralLedgerForAccounts(
  rows: QbRow[],
  columnIndex: Map<string, number>,
  accountBuckets: Map<string, FinancialTransaction['bucket']>,
): FinancialTransaction[] {
  const allowedAccounts = new Set([...accountBuckets.keys()].map(normalizeAccountKey));
  const transactions: FinancialTransaction[] = [];
  const seen = new Set<string>();

  function isAllowedAccount(accountName: string): boolean {
    return allowedAccounts.has(normalizeAccountKey(accountName));
  }

  function walk(list: QbRow[], currentAccount: string | null, inExpense: boolean): void {
    for (const row of list) {
      const group = row.group ?? '';
      const name = rowName(row);
      const nested = asRows(row.Rows?.Row);
      const nextExpense = inExpense || group === 'Expenses' || group === 'OtherExpenses' || group === 'COGS';
      let nextAccount = currentAccount;

      if (isAccountHeader(row, name, nested.length)) {
        nextAccount = name;
      }

      if (nested.length > 0) {
        walk(nested, nextAccount, nextExpense);
        continue;
      }

      if (!isTransactionRow(row) || !nextAccount || !isAllowedAccount(nextAccount)) continue;

      const accountName = nextAccount.slice(0, 200);
      const cols = row.ColData ?? [];
      const date = reportColValue(cols, columnIndex, 'tx_date', 0)?.trim() || null;
      if (!looksLikeDate(date)) continue;

      const amount = reportAmount(cols, columnIndex);
      if (amount === 0) continue;

      const type = reportColValue(cols, columnIndex, 'txn_type', 1)?.trim() || null;
      const docNum = reportColValue(cols, columnIndex, 'doc_num', 2)?.trim() || null;
      const displayName = (reportColValue(cols, columnIndex, 'name', 3) ?? type ?? accountName)
        .trim()
        .slice(0, 200);
      const memo = reportColValue(cols, columnIndex, 'memo', 4)?.trim() || null;
      const bucket = resolveAccountBucket(accountName, accountBuckets, nextExpense);

      const key = `${date}|${type ?? ''}|${docNum ?? ''}|${accountName}|${amount}|${displayName}`;
      if (seen.has(key)) continue;
      seen.add(key);

      transactions.push({
        date,
        type,
        docNum,
        name: displayName || accountName,
        memo: memo ? memo.slice(0, 300) : null,
        accountName,
        cents: amount,
        bucket,
      });
    }
  }

  walk(rows, null, false);
  return transactions;
}

const PNL_CACHE_MS = 30 * 60 * 1000;

function snapshotFromRow(row: Record<string, unknown>): FinancialSnapshot {
  return {
    source: 'quickbooks',
    accountingMethod: 'cash',
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    revenueCents: Number(row.revenue_cents),
    therapistCompensationCents: Number(row.therapist_compensation_cents),
    managementCompensationCents: Number(row.management_compensation_cents),
    softwareAndTechnologyCents: Number(row.software_and_technology_cents),
    totalExpensesCents: Number(row.total_expenses_cents),
    netIncomeCents: Number(row.net_income_cents),
    notes: (row.notes as string | null) ?? null,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(getEnv().BETTER_AUTH_SECRET);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.byteLength + encrypted.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(encrypted), iv.byteLength);
  return bytesToBase64(packed);
}

async function decryptSecret(payload: string): Promise<string> {
  const packed = base64ToBytes(payload);
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const key = await aesKey(getEnv().BETTER_AUTH_SECRET);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

function basicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`);
}

export class QuickBooksProvider implements FinancialDataProvider {
  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.QB_CLIENT_ID && env.QB_CLIENT_SECRET);
  }

  authorizationUrl(state: string, redirectUri: string): string {
    const env = getEnv();
    const params = new URLSearchParams({
      client_id: env.QB_CLIENT_ID ?? '',
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri,
      state,
    });
    return `${INTUIT_AUTH}?${params.toString()}`;
  }

  async saveOauthState(state: string, userId: string): Promise<void> {
    const { SESSION } = getEnv();
    if (!SESSION) {
      throw new Error('SESSION binding is required for QuickBooks OAuth.');
    }
    await SESSION.put(
      `${OAUTH_STATE_PREFIX}${state}`,
      JSON.stringify({ userId, createdAt: nowMs() }),
      { expirationTtl: 600 },
    );
  }

  async readOauthState(state: string): Promise<{ userId: string } | null> {
    const { SESSION } = getEnv();
    const raw = await SESSION?.get(`${OAUTH_STATE_PREFIX}${state}`);
    if (!raw) return null;
    await SESSION?.delete(`${OAUTH_STATE_PREFIX}${state}`);
    try {
      const parsed = JSON.parse(raw) as { userId?: string };
      return parsed.userId ? { userId: parsed.userId } : null;
    } catch {
      return null;
    }
  }

  async exchangeCode(code: string, redirectUri: string, realmId: string, userId: string): Promise<void> {
    const env = getEnv();
    if (!env.QB_CLIENT_ID || !env.QB_CLIENT_SECRET) {
      throw new Error('QuickBooks credentials are not configured.');
    }

    const tokens = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    );

    await this.storeTokens(tokens, realmId, userId);
    await this.syncSnapshot();
  }

  async syncSnapshot(): Promise<void> {
    const ytd = resolvePreset('ytd');
    try {
      const accessToken = await this.validAccessToken();
      const connection = await this.connection();
      if (!connection?.realm_id) {
        throw new Error('QuickBooks is not connected.');
      }

      await this.fetchAndStorePnl(accessToken, connection.realm_id, ytd.start, ytd.end, { includeBanks: true });

      await getEnv()
        .DB.prepare(
          `UPDATE quickbooks_connection
           SET status = 'connected', last_sync_at = ?, last_error = NULL
           WHERE id = ?`,
        )
        .bind(nowMs(), CONNECTION_ID)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QuickBooks sync failed.';
      await getEnv()
        .DB.prepare(`UPDATE quickbooks_connection SET status = 'error', last_error = ? WHERE id = ?`)
        .bind(message.slice(0, 500), CONNECTION_ID)
        .run();
      throw error;
    }
  }

  async getSnapshot(): Promise<FinancialSnapshot | null> {
    return this.readSnapshot();
  }

  async getCachedSnapshot(periodStart: string, periodEnd: string): Promise<FinancialSnapshot | null> {
    return (await this.readSnapshot(periodStart, periodEnd)) ?? (await this.readNearestSnapshot(periodStart, periodEnd));
  }

  async getOrFetchSnapshot(periodStart: string, periodEnd: string): Promise<FinancialSnapshot | null> {
    const cached = await this.readSnapshot(periodStart, periodEnd);
    const fallback = cached ?? (await this.readNearestSnapshot(periodStart, periodEnd));
    const today = todayEastern();
    const createdAt = cached ? await this.snapshotCreatedAt(periodStart, periodEnd) : null;
    const fresh =
      cached != null &&
      createdAt != null &&
      (periodEnd < today || nowMs() - createdAt < PNL_CACHE_MS);
    if (fresh) return cached;

    try {
      const accessToken = await this.validAccessToken();
      const connection = await this.connection();
      if (!connection?.realm_id) return fallback;

      return await this.fetchAndStorePnl(accessToken, connection.realm_id, periodStart, periodEnd, {
        includeBanks: false,
      });
    } catch {
      return fallback;
    }
  }

  private async readSnapshot(periodStart?: string, periodEnd?: string): Promise<FinancialSnapshot | null> {
    const { DB } = getEnv();
    const row =
      periodStart && periodEnd
        ? await DB.prepare(
            `SELECT source, accounting_method, period_start, period_end,
                    revenue_cents, therapist_compensation_cents, management_compensation_cents,
                    software_and_technology_cents, total_expenses_cents, net_income_cents, notes
             FROM financial_snapshot
             WHERE source = 'quickbooks' AND period_start = ? AND period_end = ?
             ORDER BY created_at DESC
             LIMIT 1`,
          )
            .bind(periodStart, periodEnd)
            .first<Record<string, unknown>>()
        : await DB.prepare(
            `SELECT source, accounting_method, period_start, period_end,
                    revenue_cents, therapist_compensation_cents, management_compensation_cents,
                    software_and_technology_cents, total_expenses_cents, net_income_cents, notes
             FROM financial_snapshot
             WHERE source = 'quickbooks'
             ORDER BY period_end DESC, created_at DESC
             LIMIT 1`,
          ).first<Record<string, unknown>>();

    return row ? snapshotFromRow(row) : null;
  }

  private async readNearestSnapshot(periodStart: string, periodEnd: string): Promise<FinancialSnapshot | null> {
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT source, accounting_method, period_start, period_end,
              revenue_cents, therapist_compensation_cents, management_compensation_cents,
              software_and_technology_cents, total_expenses_cents, net_income_cents, notes
       FROM financial_snapshot
       WHERE source = 'quickbooks' AND period_start = ? AND period_end <= ?
       ORDER BY period_end DESC, created_at DESC
       LIMIT 1`,
    )
      .bind(periodStart, periodEnd)
      .first<Record<string, unknown>>();

    return row ? snapshotFromRow(row) : null;
  }

  private async snapshotCreatedAt(periodStart: string, periodEnd: string): Promise<number | null> {
    const row = await getEnv()
      .DB.prepare(
        `SELECT created_at FROM financial_snapshot
         WHERE source = 'quickbooks' AND period_start = ? AND period_end = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(periodStart, periodEnd)
      .first<{ created_at: number }>();
    return row?.created_at ?? null;
  }

  private async fetchAndStorePnl(
    accessToken: string,
    realmId: string,
    periodStart: string,
    periodEnd: string,
    options: { includeBanks: boolean },
  ): Promise<FinancialSnapshot> {
    const env = getEnv();
    const pnl = (await this.qbGet(
      accessToken,
      realmId,
      `/reports/ProfitAndLoss?accounting_method=Cash&summarize_column_by=Total&start_date=${periodStart}&end_date=${periodEnd}`,
    )) as {
      Header?: { ReportBasis?: string; StartPeriod?: string; EndPeriod?: string };
      Rows?: { Row?: QbRow | QbRow[] };
    };

    const parsed = parsePnl(asRows(pnl.Rows?.Row));
    const basis = pnl.Header?.ReportBasis ?? 'Cash';
    const pnlLines = [...parsed.leaves.entries()].map(([name, line]) => ({
      name: name.slice(0, 200),
      cents: line.cents,
      bucket: (classifyExpense(name) ?? (line.expense ? 'other' : 'income')) as FinancialTransaction['bucket'],
    }));
    const accountBuckets = new Map<string, FinancialTransaction['bucket']>(
      pnlLines.map((line) => [line.name, line.bucket]),
    );
    const pnlDetail = (await this.qbGet(
      accessToken,
      realmId,
      `/reports/ProfitAndLossDetail?accounting_method=Cash&start_date=${periodStart}&end_date=${periodEnd}&columns=tx_date,txn_type,doc_num,name,memo,subt_nat_amount`,
    )) as {
      Columns?: { Column?: QbReportColumn | QbReportColumn[] };
      Rows?: { Row?: QbRow | QbRow[] };
    };
    const detailColumnIndex = buildColumnIndex(pnlDetail);
    let transactions = parsePnlDetail(
      asRows(pnlDetail.Rows?.Row),
      detailColumnIndex,
      accountBuckets,
    );
    if (transactions.length === 0 && accountBuckets.size > 0) {
      const generalLedger = (await this.qbGet(
        accessToken,
        realmId,
        `/reports/GeneralLedger?accounting_method=Cash&start_date=${periodStart}&end_date=${periodEnd}&columns=tx_date,txn_type,doc_num,name,memo,subt_nat_amount`,
      )) as {
        Columns?: { Column?: QbReportColumn | QbReportColumn[] };
        Rows?: { Row?: QbRow | QbRow[] };
      };
      transactions = parseGeneralLedgerForAccounts(
        asRows(generalLedger.Rows?.Row),
        buildColumnIndex(generalLedger),
        accountBuckets,
      );
    }

    let therapist = 0;
    let management = 0;
    let software = 0;
    for (const [name, line] of parsed.leaves) {
      const kind = classifyExpense(name);
      if (kind === 'therapist') therapist += line.cents;
      if (kind === 'management') management += line.cents;
      if (kind === 'software') software += line.cents;
    }

    const tracked = therapist + management + software;
    const totalExpenses = tracked > 0 ? tracked : parsed.expenses;
    const netIncome = tracked > 0 ? parsed.income - tracked : parsed.net;

    type BankAccount = {
      Name?: string;
      FullyQualifiedName?: string;
      AcctNum?: string;
      CurrentBalance?: number;
    };

    let relay: number | null = null;
    let boa: number | null = null;
    let bankAccounts: Array<{ name: string; balanceCents: number; mappedKey: ReturnType<typeof classifyBank> }> = [];

    if (options.includeBanks) {
      const accounts = await this.qbGet(
        accessToken,
        realmId,
        `/query?query=${encodeURIComponent("select * from Account where AccountType = 'Bank' maxresults 100")}`,
      );
      const bankRows = asRows(
        (accounts as { QueryResponse?: { Account?: BankAccount | BankAccount[] } }).QueryResponse?.Account,
      );
      bankAccounts = bankRows.map((account) => {
        const label = (account.FullyQualifiedName || account.Name || 'Bank').slice(0, 200);
        const kind = classifyBank(`${account.FullyQualifiedName ?? ''} ${account.Name ?? ''}`, account.AcctNum);
        const cents = dollarsToCents(account.CurrentBalance);
        if (kind === 'relay_operating') relay = (relay ?? 0) + cents;
        if (kind === 'boa_reserve') boa = (boa ?? 0) + cents;
        return { name: label, balanceCents: cents, mappedKey: kind };
      });
      await this.upsertCash('relay_operating', 'Relay operating cash', relay, periodEnd);
      await this.upsertCash('boa_reserve', 'Bank of America reserve', boa, periodEnd);
    }

    const notes = JSON.stringify({
      label: `Live QuickBooks ${qbEnvironment()} ${basis} P&L ${pnl.Header?.StartPeriod ?? periodStart} to ${pnl.Header?.EndPeriod ?? periodEnd}.`,
      qboNet: parsed.net,
      qboExpenses: parsed.expenses,
      lines: pnlLines,
      transactions,
      banks: bankAccounts,
    });
    const snapshotId = `snap_qb_${periodStart}_${periodEnd}_${randomToken(4)}`;
    await env.DB.prepare(
      `INSERT INTO financial_snapshot (
         id, source, accounting_method, period_start, period_end,
         revenue_cents, therapist_compensation_cents, management_compensation_cents,
         software_and_technology_cents, total_expenses_cents, net_income_cents, created_at, notes
       ) VALUES (?, 'quickbooks', 'cash', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        snapshotId,
        periodStart,
        periodEnd,
        parsed.income,
        therapist,
        management,
        software,
        totalExpenses,
        netIncome,
        nowMs(),
        notes,
      )
      .run();

    return snapshotFromRow({
      period_start: periodStart,
      period_end: periodEnd,
      revenue_cents: parsed.income,
      therapist_compensation_cents: therapist,
      management_compensation_cents: management,
      software_and_technology_cents: software,
      total_expenses_cents: totalExpenses,
      net_income_cents: netIncome,
      notes,
    });
  }

  private async requestTokens(body: URLSearchParams): Promise<TokenResponse> {
    const env = getEnv();
    const response = await fetch(INTUIT_TOKEN, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(env.QB_CLIENT_ID ?? '', env.QB_CLIENT_SECRET ?? '')}`,
      },
      body,
    });
    const payload = (await response.json()) as TokenResponse & { error?: string; error_description?: string };
    if (!response.ok || !payload.access_token || !payload.refresh_token) {
      throw new Error(payload.error_description || payload.error || 'QuickBooks token request failed.');
    }
    return payload;
  }

  private async storeTokens(tokens: TokenResponse, realmId: string, userId: string): Promise<void> {
    const env = getEnv();
    const accessExpires = nowMs() + tokens.expires_in * 1000;
    const refreshExpires = tokens.x_refresh_token_expires_in
      ? nowMs() + tokens.x_refresh_token_expires_in * 1000
      : nowMs() + 100 * 24 * 60 * 60 * 1000;

    await env.DB.prepare(
      `UPDATE quickbooks_connection
       SET realm_id = ?, access_token_encrypted = ?, refresh_token_encrypted = ?,
           access_token_expires_at = ?, refresh_token_expires_at = ?,
           connected_by = COALESCE(?, connected_by),
           connected_at = COALESCE(connected_at, ?),
           status = 'connected', last_error = NULL
       WHERE id = ?`,
    )
      .bind(
        realmId,
        await encryptSecret(tokens.access_token),
        await encryptSecret(tokens.refresh_token),
        accessExpires,
        refreshExpires,
        userId || null,
        nowMs(),
        CONNECTION_ID,
      )
      .run();
  }

  private async connection(): Promise<ConnectionRow | null> {
    const { DB } = getEnv();
    return DB.prepare(
      `SELECT realm_id, access_token_encrypted, refresh_token_encrypted,
              access_token_expires_at, refresh_token_expires_at, connected_by, status
       FROM quickbooks_connection WHERE id = ?`,
    )
      .bind(CONNECTION_ID)
      .first<ConnectionRow>();
  }

  private async validAccessToken(): Promise<string> {
    const row = await this.connection();
    if (!row?.access_token_encrypted || !row.refresh_token_encrypted) {
      throw new Error('QuickBooks is not connected.');
    }

    const stillValid = (row.access_token_expires_at ?? 0) - nowMs() > 5 * 60 * 1000;
    if (stillValid) {
      return decryptSecret(row.access_token_encrypted);
    }

    const refreshed = await this.requestTokens(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: await decryptSecret(row.refresh_token_encrypted),
      }),
    );
    await this.storeTokens(refreshed, row.realm_id ?? '', row.connected_by ?? '');
    return refreshed.access_token;
  }

  private async qbGet(accessToken: string, realmId: string, path: string): Promise<unknown> {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(
      `${apiHost(qbEnvironment())}/v3/company/${realmId}${path}${separator}minorversion=75`,
      {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = (await response.json()) as { Fault?: { Error?: Array<{ Message?: string; Detail?: string }> } };
    if (!response.ok) {
      const fault = payload.Fault?.Error?.[0];
      throw new Error(fault?.Detail || fault?.Message || `QuickBooks request failed (${response.status}).`);
    }
    return payload;
  }

  private async upsertCash(
    accountKey: string,
    label: string,
    balanceCents: number | null,
    asOfDate: string,
  ): Promise<void> {
    const { DB } = getEnv();
    await DB.prepare(
      `INSERT INTO cash_account_balance (account_key, label, balance_cents, as_of_date, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_key) DO UPDATE SET
         label = excluded.label,
         balance_cents = excluded.balance_cents,
         as_of_date = excluded.as_of_date,
         updated_at = excluded.updated_at`,
    )
      .bind(accountKey, label, balanceCents, balanceCents == null ? null : asOfDate, nowMs())
      .run();
  }
}
