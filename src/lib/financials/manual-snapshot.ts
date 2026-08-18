import { getEnv } from '../env';
import type { FinancialDataProvider, FinancialSnapshot } from './types';

export class ManualSnapshotProvider implements FinancialDataProvider {
  async getSnapshot(): Promise<FinancialSnapshot | null> {
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT source, accounting_method, period_start, period_end,
              revenue_cents, therapist_compensation_cents, management_compensation_cents,
              software_and_technology_cents, total_expenses_cents, net_income_cents, notes
       FROM financial_snapshot
       ORDER BY period_end DESC, created_at DESC
       LIMIT 1`,
    ).first<{
      source: 'manual' | 'quickbooks';
      accounting_method: 'cash';
      period_start: string;
      period_end: string;
      revenue_cents: number;
      therapist_compensation_cents: number;
      management_compensation_cents: number;
      software_and_technology_cents: number;
      total_expenses_cents: number;
      net_income_cents: number;
      notes: string | null;
    }>();

    if (!row) return null;

    return {
      source: row.source,
      accountingMethod: row.accounting_method,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      revenueCents: row.revenue_cents,
      therapistCompensationCents: row.therapist_compensation_cents,
      managementCompensationCents: row.management_compensation_cents,
      softwareAndTechnologyCents: row.software_and_technology_cents,
      totalExpensesCents: row.total_expenses_cents,
      netIncomeCents: row.net_income_cents,
      notes: row.notes,
    };
  }
}
