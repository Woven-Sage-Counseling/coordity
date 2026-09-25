import { DEFAULT_ORG_ID } from '../organization';
import { ManualSnapshotProvider } from './manual-snapshot';
import {
  centsByOutlookLine,
  expenseTotals,
  getFinancialOutlook,
  readCashBalances,
  readSnapshotNotes,
} from './outlook';
import { averagingStart, resolvePeriodFromSearch, resolvePreset } from './periods';
import { QuickBooksProvider } from './quickbooks';
import type { FinancialSnapshot, FinancialSummary, OutlookDisplayLine } from './types';

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

export async function getFinancialSummary(
  search?: URLSearchParams | null,
  options?: { cachedOnly?: boolean; orgId?: string },
): Promise<FinancialSummary> {
  const orgId = options?.orgId || DEFAULT_ORG_ID;
  const qb = new QuickBooksProvider(orgId);
  const manual = new ManualSnapshotProvider(orgId);
  const period = resolvePeriodFromSearch(search);
  const ytd = resolvePreset('ytd');
  const outlook = await getFinancialOutlook(orgId);
  const readSnapshot = (start: string, end: string) =>
    options?.cachedOnly ? qb.getCachedSnapshot(start, end) : qb.getOrFetchSnapshot(start, end);
  const snapshot = (await readSnapshot(period.start, period.end)) ?? (await manual.getSnapshot());
  const selectedNotes = readSnapshotNotes(snapshot?.notes);
  const ytdReserveStart = outlook.operationsStart
    ? averagingStart(ytd.start, ytd.end, outlook.operationsStart)
    : ytd.start;
  const reserveSnapshot =
    period.start === ytdReserveStart && period.end === ytd.end
      ? snapshot
      : ((await readSnapshot(ytdReserveStart, ytd.end)) ??
        (await qb.getCachedSnapshot(ytd.start, ytd.end)) ??
        snapshot);
  const bankNotes = selectedNotes.banks.length > 0 ? selectedNotes : readSnapshotNotes(reserveSnapshot?.notes);
  const amounts = centsByOutlookLine(outlook, {
    ...selectedNotes,
    banks: bankNotes.banks,
  });
  const storedCash = amounts.cash.size > 0 ? amounts.cash : await readCashBalances(orgId);

  const expenseLines: OutlookDisplayLine[] = outlook.lines
    .filter((line) => line.kind === 'expense')
    .map((line) => ({
      id: line.id,
      label: line.label,
      color: line.color,
      role: 'expense' as const,
      cents: amounts.expense.get(line.id) ?? 0,
    }));
  const cashLines: OutlookDisplayLine[] = outlook.lines
    .filter((line) => line.kind === 'cash')
    .map((line) => ({
      id: line.id,
      label: line.label,
      color: line.color,
      role: line.role === 'reserve' ? ('reserve' as const) : ('operating' as const),
      cents: storedCash.get(line.id) ?? null,
    }));

  const incomeCents = snapshot?.revenueCents ?? 0;
  const qboExpenses = selectedNotes.qboExpenses ?? snapshot?.totalExpensesCents ?? 0;
  const qboNet = selectedNotes.qboNet ?? snapshot?.netIncomeCents ?? incomeCents - qboExpenses;
  const reported = snapshot
    ? expenseTotals({
        outlook,
        incomeCents,
        qboExpensesCents: qboExpenses,
        qboNetCents: qboNet,
        lineCents: amounts.expense,
      })
    : { totalExpensesCents: 0, netIncomeCents: 0 };

  const reserveLine = cashLines.find((line) => line.role === 'reserve') ?? null;
  const operationsStart = outlook.operationsStart;
  const reserveAveragingStart =
    reserveLine && reserveSnapshot && operationsStart
      ? averagingStart(reserveSnapshot.periodStart, reserveSnapshot.periodEnd, operationsStart)
      : reserveLine && reserveSnapshot
        ? reserveSnapshot.periodStart
        : null;
  const reserveTargetCents =
    reserveLine && reserveSnapshot && reserveAveragingStart
      ? averageMonthlyRevenueCents(
          reserveSnapshot.revenueCents,
          reserveAveragingStart,
          reserveSnapshot.periodEnd,
        ) * outlook.reserveTargetMonths
      : null;
  const reserveCents = reserveLine?.cents ?? null;
  const reserveProgressRatio =
    reserveCents != null && reserveTargetCents && reserveTargetCents > 0 ? reserveCents / reserveTargetCents : null;

  const totalCashCents = cashLines.every((line) => line.cents != null)
    ? cashLines.reduce((sum, line) => sum + (line.cents ?? 0), 0)
    : null;

  const qbStatus = await qb.getConnectionStatus();

  return {
    period,
    snapshot,
    expenseLines,
    cashLines,
    reportedExpensesCents: snapshot ? reported.totalExpensesCents : null,
    reportedNetCents: snapshot ? reported.netIncomeCents : null,
    totalCashCents: cashLines.length > 0 ? totalCashCents : null,
    reserveTargetMonths: outlook.reserveTargetMonths,
    reserveTargetCents,
    reserveProgressRatio,
    reserveAveragingStart,
    reserveCents,
    pnlLines: selectedNotes.pnlLines.map((line) => ({
      name: line.name,
      cents: line.cents,
      bucket: line.expense ? 'other' : 'income',
      accountId: line.accountId,
    })),
    transactions: selectedNotes.transactions,
    bankAccounts: bankNotes.banks.map((bank) => ({
      name: bank.name,
      balanceCents: bank.balanceCents,
      mappedKey: null,
      accountId: bank.accountId,
      accountNumber: bank.accountNumber,
    })),
    quickbooks: {
      configured: qbStatus.configured,
      status: qbStatus.status,
      lastSyncAt: qbStatus.lastSyncAt,
      lastError: qbStatus.lastError,
      environment: qbStatus.environment,
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

export function calendarDateValue(value: string | null | undefined): number {
  if (!value) return 0;
  return parseCalendarDate(value)?.getTime() ?? 0;
}

export type { FinancialSnapshot };
