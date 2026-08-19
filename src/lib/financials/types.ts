import type { ResolvedPeriod } from './periods';

export interface FinancialSnapshot {
  source: 'manual' | 'quickbooks';
  accountingMethod: 'cash';
  periodStart: string;
  periodEnd: string;
  revenueCents: number;
  therapistCompensationCents: number;
  managementCompensationCents: number;
  softwareAndTechnologyCents: number;
  totalExpensesCents: number;
  netIncomeCents: number;
  notes?: string | null;
}

export interface CashBalances {
  relayOperatingCents: number | null;
  boaReserveCents: number | null;
}

export interface PnlLine {
  name: string;
  cents: number;
  bucket: 'therapist' | 'management' | 'software' | 'income' | 'other' | null;
}

export interface BankAccountLine {
  name: string;
  balanceCents: number | null;
  mappedKey: 'relay_operating' | 'boa_reserve' | null;
}

export interface FinancialSummary {
  period: ResolvedPeriod;
  snapshot: FinancialSnapshot | null;
  cash: CashBalances;
  totalCashCents: number | null;
  reserveTargetMonths: number;
  reserveTargetCents: number | null;
  reserveProgressRatio: number | null;
  reserveAveragingStart: string | null;
  pnlLines: PnlLine[];
  bankAccounts: BankAccountLine[];
  quickbooks: {
    configured: boolean;
    status: 'disconnected' | 'connected' | 'error';
    lastSyncAt: number | null;
    lastError: string | null;
    environment: 'sandbox' | 'production';
  };
}

export interface FinancialDataProvider {
  getSnapshot(): Promise<FinancialSnapshot | null>;
}
