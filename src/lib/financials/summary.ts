import { getEnv } from '../env';
import { ManualSnapshotProvider } from './manual-snapshot';
import { QuickBooksProvider } from './quickbooks';
import type { CashBalances, FinancialSummary } from './types';

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

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const env = getEnv();
  const qb = new QuickBooksProvider();
  const manual = new ManualSnapshotProvider();
  const snapshot = (await qb.getSnapshot()) ?? (await manual.getSnapshot());

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

  const reserveTargetCents = snapshot
    ? averageMonthlyRevenueCents(snapshot.revenueCents, snapshot.periodStart, snapshot.periodEnd) *
      reserveTargetMonths
    : null;

  const reserveProgressRatio =
    totalCashCents != null && reserveTargetCents && reserveTargetCents > 0
      ? totalCashCents / reserveTargetCents
      : null;

  const connection = await env.DB.prepare(
    `SELECT status, last_sync_at, last_error FROM quickbooks_connection WHERE id = 'default'`,
  ).first<{ status: 'disconnected' | 'connected' | 'error'; last_sync_at: number | null; last_error: string | null }>();

  return {
    snapshot,
    cash,
    totalCashCents,
    reserveTargetMonths,
    reserveTargetCents,
    reserveProgressRatio,
    quickbooks: {
      configured: qb.isConfigured(),
      status: connection?.status ?? 'disconnected',
      lastSyncAt: connection?.last_sync_at ?? null,
      lastError: connection?.last_error ?? null,
      environment: env.QB_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
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
