import { getEnv, practiceOperationsStart, qbApiEnvironment } from '../env';
import { ManualSnapshotProvider } from './manual-snapshot';
import { averagingStart, resolvePeriodFromSearch, resolvePreset } from './periods';
import { QuickBooksProvider } from './quickbooks';
import type { BankAccountLine, CashBalances, FinancialSummary, FinancialTransaction, PnlLine } from './types';

function daysInclusive(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

function averageMonthlyRevenueCents(revenueCents: number, periodStart: string, periodEnd: string): number {
  const days = daysInclusive(periodStart, periodEnd);
  const averageDay = revenueCents / days;
  return Math.round(averageDay * 30.4375);
}

function parseSnapshotMeta(snapshot: { notes?: string | null } | null): {
  pnlLines: PnlLine[];
  transactions: FinancialTransaction[];
  bankAccounts: BankAccountLine[];
} {
  if (!snapshot?.notes?.startsWith('{')) return { pnlLines: [], transactions: [], bankAccounts: [] };
  try {
    const meta = JSON.parse(snapshot.notes) as {
      lines?: PnlLine[];
      transactions?: FinancialTransaction[];
      banks?: BankAccountLine[];
    };
    return {
      pnlLines: meta.lines ?? [],
      transactions: meta.transactions ?? [],
      bankAccounts: meta.banks ?? [],
    };
  } catch {
    return { pnlLines: [], transactions: [], bankAccounts: [] };
  }
}

export async function getFinancialSummary(search?: URLSearchParams | null): Promise<FinancialSummary> {
  const env = getEnv();
  const qb = new QuickBooksProvider();
  const manual = new ManualSnapshotProvider();
  const period = resolvePeriodFromSearch(search);
  const ytd = resolvePreset('ytd');
  const snapshot =
    (await qb.getOrFetchSnapshot(period.start, period.end)) ?? (await manual.getSnapshot());
  const operationsStart = practiceOperationsStart();
  const ytdReserveStart = averagingStart(ytd.start, ytd.end, operationsStart);
  const reserveSnapshot =
    period.start === ytdReserveStart && period.end === ytd.end
      ? snapshot
      : ((await qb.getOrFetchSnapshot(ytdReserveStart, ytd.end)) ??
        (await qb.getCachedSnapshot(ytd.start, ytd.end)) ??
        snapshot);

  const cashRow = await env.DB.prepare(
    `SELECT account_key, balance_cents FROM cash_account_balance`,
  ).all<{ account_key: string; balance_cents: number | null }>();

  const cash: CashBalances = {
    relayOperatingCents: null,
    boaReserveCents: null,
  };
  for (const row of cashRow.results ?? []) {
    if (row.account_key === 'relay_operating') cash.relayOperatingCents = row.balance_cents;
    if (row.account_key === 'boa_reserve') cash.boaReserveCents = row.balance_cents;
  }

  const totalCashCents =
    cash.relayOperatingCents != null && cash.boaReserveCents != null
      ? cash.relayOperatingCents + cash.boaReserveCents
      : null;

  const reserve = await env.DB.prepare(
    `SELECT target_months FROM reserve_setting WHERE id = 1`,
  ).first<{ target_months: number }>();
  const reserveTargetMonths = reserve?.target_months ?? 3;

  const reserveAveragingStart = reserveSnapshot
    ? averagingStart(reserveSnapshot.periodStart, reserveSnapshot.periodEnd, operationsStart)
    : null;
  const reserveTargetCents = reserveSnapshot
    ? averageMonthlyRevenueCents(
        reserveSnapshot.revenueCents,
        reserveAveragingStart!,
        reserveSnapshot.periodEnd,
      ) * reserveTargetMonths
    : null;

  const reserveProgressRatio =
    cash.boaReserveCents != null && reserveTargetCents && reserveTargetCents > 0
      ? cash.boaReserveCents / reserveTargetCents
      : null;

  const connection = await env.DB.prepare(
    `SELECT status, last_sync_at, last_error FROM quickbooks_connection WHERE id = 'default'`,
  ).first<{ status: 'disconnected' | 'connected' | 'error'; last_sync_at: number | null; last_error: string | null }>();

  const selectedMeta = parseSnapshotMeta(snapshot);
  const reserveMeta = parseSnapshotMeta(reserveSnapshot);
  const pnlLines = selectedMeta.pnlLines;
  const transactions = selectedMeta.transactions;
  const bankAccounts =
    selectedMeta.bankAccounts.length > 0 ? selectedMeta.bankAccounts : reserveMeta.bankAccounts;

  return {
    period,
    snapshot,
    cash,
    totalCashCents,
    reserveTargetMonths,
    reserveTargetCents,
    reserveProgressRatio,
    reserveAveragingStart,
    pnlLines,
    transactions,
    bankAccounts,
    quickbooks: {
      configured: qb.isConfigured(),
      status: connection?.status ?? 'disconnected',
      lastSyncAt: connection?.last_sync_at ?? null,
      lastError: connection?.last_error ?? null,
      environment: qbApiEnvironment(),
    },
  };
}

export function formatUsd(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function ordinalDay(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

function parseCalendarDate(value: string): Date | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
    const [month, day, yearRaw] = trimmed.split('/').map(Number);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return null;
}

export function formatDisplayDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = parseCalendarDate(value);
  if (!date) return value;
  const month = date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month}, ${ordinalDay(day)} ${year}`;
}
