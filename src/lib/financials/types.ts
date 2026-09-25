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

export interface OutlookDisplayLine {
  id: string;
  label: string;
  color: string | null;
  role: 'expense' | 'operating' | 'reserve';
  cents: number | null;
}

export interface PnlLine {
  name: string;
  cents: number;
  bucket: string | null;
  accountId?: string | null;
}

export interface FinancialTransaction {
  date: string | null;
  type: string | null;
  docNum: string | null;
  name: string;
  memo: string | null;
  accountName: string;
  cents: number;
  bucket: string | null;
}

export interface BankAccountLine {
  name: string;
  balanceCents: number | null;
  mappedKey: string | null;
  accountId?: string | null;
  accountNumber?: string | null;
}

export interface FinancialSummary {
  period: ResolvedPeriod;
  snapshot: FinancialSnapshot | null;
  expenseLines: OutlookDisplayLine[];
  cashLines: OutlookDisplayLine[];
  reportedExpensesCents: number | null;
  reportedNetCents: number | null;
  totalCashCents: number | null;
  reserveTargetMonths: number;
  reserveTargetCents: number | null;
  reserveProgressRatio: number | null;
  reserveAveragingStart: string | null;
  reserveCents: number | null;
  pnlLines: PnlLine[];
  transactions: FinancialTransaction[];
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
