import { getEnv, practiceOperationsStart, qbApiEnvironment } from '../env';
import { ManualSnapshotProvider } from './manual-snapshot';
import { averagingStart, resolvePeriodFromSearch, resolvePreset } from './periods';
import { QuickBooksProvider } from './quickbooks';
import type { BankAccountLine, CashBalances, FinancialSummary, PnlLine } from './types';

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
  bankAccounts: BankAccountLine[];
} {
  if (!snapshot?.notes?.startsWith('{')) return { pnlLines: [], bankAccounts: [] };
  try {
    const meta = JSON.parse(snapshot.notes) as {
      lines?: PnlLine[];
      banks?: BankAccountLine[];
    };
    return { pnlLines: meta.lines ?? [], bankAccounts: meta.banks ?? [] };
  } catch {
    return { pnlLines: [], bankAccounts: [] };
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
    totalCashCents != null && reserveTargetCents && reserveTargetCents > 0
      ? totalCashCents / reserveTargetCents
      : null;

  const connection = await env.DB.prepare(
    `SELECT status, last_sync_at, last_error FROM quickbooks_connection WHERE id = 'default'`,
  ).first<{ status: 'disconnected' | 'connected' | 'error'; last_sync_at: number | null; last_error: string | null }>();

  const selectedMeta = parseSnapshotMeta(snapshot);
  const reserveMeta = parseSnapshotMeta(reserveSnapshot);
  const pnlLines = selectedMeta.pnlLines;
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
