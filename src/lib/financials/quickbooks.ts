import { getEnv } from '../env';
import { nowMs, randomToken } from '../crypto';
import { classifyBank, classifyExpense } from './account-map';
import type { FinancialDataProvider, FinancialSnapshot } from './types';

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

function apiHost(environment: QbEnvironment): string {
  return environment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

function qbEnvironment(): QbEnvironment {
  return getEnv().QB_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
}

function dollarsToCents(value: string | number | undefined): number {
  if (value == null || value === '') return 0;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

function asRows(row?: QbRow | QbRow[]): QbRow[] {
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

function lastAmount(cols?: QbCol[]): number {
  if (!cols?.length) return 0;
  return dollarsToCents(cols[cols.length - 1]?.value);
}

function todayEastern(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function yearStartEastern(): string {
  return `${todayEastern().slice(0, 4)}-01-01`;
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

function walkPnl(
  rows: QbRow[],
  totals: { income: number; expenses: number; net: number },
  leaves: Map<string, number>,
): void {
  for (const row of rows) {
    const group = row.group ?? '';
    const summary = lastAmount(row.Summary?.ColData) || lastAmount(row.ColData);
    if (group === 'Income' || group === 'OtherIncome') totals.income += summary;
    if (group === 'Expenses' || group === 'OtherExpenses' || group === 'COGS') totals.expenses += summary;
    if (group === 'NetIncome') totals.net = summary;

    const nested = asRows(row.Rows?.Row);
    if (nested.length > 0) {
      walkPnl(nested, totals, leaves);
      continue;
    }

    const name = row.ColData?.[0]?.value ?? row.Header?.ColData?.[0]?.value;
    if (name && !/^total\b/i.test(name.trim())) {
      leaves.set(name, (leaves.get(name) ?? 0) + lastAmount(row.ColData));
    }
  }
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
    const env = getEnv();
    const periodStart = yearStartEastern();
    const periodEnd = todayEastern();

    try {
      const accessToken = await this.validAccessToken();
      const connection = await this.connection();
      if (!connection?.realm_id) {
        throw new Error('QuickBooks is not connected.');
      }

      const pnl = await this.qbGet(
        accessToken,
        connection.realm_id,
        `/reports/ProfitAndLoss?accounting_method=Cash&start_date=${periodStart}&end_date=${periodEnd}`,
      );
      const accounts = await this.qbGet(
        accessToken,
        connection.realm_id,
        `/query?query=${encodeURIComponent("select * from Account where AccountType = 'Bank' maxresults 100")}`,
      );

      const totals = { income: 0, expenses: 0, net: 0 };
      const leaves = new Map<string, number>();
      walkPnl(asRows((pnl as { Rows?: { Row?: QbRow | QbRow[] } }).Rows?.Row), totals, leaves);

      let therapist = 0;
      let management = 0;
      let software = 0;
      for (const [name, cents] of leaves) {
        const kind = classifyExpense(name);
        if (kind === 'therapist') therapist += cents;
        if (kind === 'management') management += cents;
        if (kind === 'software') software += cents;
      }

      const netIncome = totals.net || totals.income - totals.expenses;
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
          totals.income,
          therapist,
          management,
          software,
          totals.expenses,
          netIncome,
          nowMs(),
          `Live QuickBooks ${qbEnvironment()} cash-basis sync.`,
        )
        .run();

      const bankRows = (
        accounts as {
          QueryResponse?: {
            Account?: Array<{
              Name?: string;
              FullyQualifiedName?: string;
              AcctNum?: string;
              CurrentBalance?: number;
            }>;
          };
        }
      ).QueryResponse?.Account ?? [];

      let relay: number | null = null;
      let boa: number | null = null;
      for (const account of bankRows) {
        const kind = classifyBank(
          `${account.FullyQualifiedName ?? ''} ${account.Name ?? ''}`,
          account.AcctNum,
        );
        const cents = dollarsToCents(account.CurrentBalance);
        if (kind === 'relay_operating') relay = (relay ?? 0) + cents;
        if (kind === 'boa_reserve') boa = (boa ?? 0) + cents;
      }

      await this.upsertCash('relay_operating', 'Relay operating cash', relay, periodEnd);
      await this.upsertCash('boa_reserve', 'Bank of America reserve', boa, periodEnd);

      await env.DB.prepare(
        `UPDATE quickbooks_connection
         SET status = 'connected', last_sync_at = ?, last_error = NULL
         WHERE id = ?`,
      )
        .bind(nowMs(), CONNECTION_ID)
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QuickBooks sync failed.';
      await env.DB.prepare(
        `UPDATE quickbooks_connection SET status = 'error', last_error = ? WHERE id = ?`,
      )
        .bind(message.slice(0, 500), CONNECTION_ID)
        .run();
      throw error;
    }
  }

  async getSnapshot(): Promise<FinancialSnapshot | null> {
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT source, accounting_method, period_start, period_end,
              revenue_cents, therapist_compensation_cents, management_compensation_cents,
              software_and_technology_cents, total_expenses_cents, net_income_cents, notes
       FROM financial_snapshot
       WHERE source = 'quickbooks'
       ORDER BY period_end DESC, created_at DESC
       LIMIT 1`,
    ).first<Record<string, unknown>>();

    if (!row) return null;

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
