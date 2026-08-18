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

export interface FinancialSummary {
  snapshot: FinancialSnapshot | null;
  cash: CashBalances;
  totalCashCents: number | null;
  reserveTargetMonths: number;
  reserveTargetCents: number | null;
  reserveProgressRatio: number | null;
  quickbooks: {
    configured: boolean;
    status: 'disconnected' | 'connected' | 'error';
    lastSyncAt: number | null;
    lastError: string | null;
  };
}

export interface FinancialDataProvider {
  getSnapshot(): Promise<FinancialSnapshot | null>;
}
