import { getEnv } from '../env';
import type { FinancialDataProvider, FinancialSnapshot } from './types';

const INTUIT_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/**
 * QuickBooks Online provider.
 * v1: OAuth scaffolding only. Returns null until a connection exists and a sync has stored a snapshot.
 * Tokens are stored in D1 and never sent to the browser.
 */
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

  async exchangeCode(_code: string, _redirectUri: string): Promise<void> {
    const env = getEnv();
    if (!env.QB_CLIENT_ID || !env.QB_CLIENT_SECRET) {
      throw new Error('QuickBooks credentials are not configured.');
    }
    // Token exchange will POST to INTUIT_TOKEN with server-side secrets.
    void INTUIT_TOKEN;
    throw new Error('QuickBooks token exchange is not enabled until OAuth secrets and redirect URI are set.');
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
    ).first<FinancialSnapshot & Record<string, unknown>>();

    if (!row) return null;

    return {
      source: 'quickbooks',
      accountingMethod: 'cash',
      periodStart: String(row.period_start ?? row.periodStart),
      periodEnd: String(row.period_end ?? row.periodEnd),
      revenueCents: Number(row.revenue_cents ?? row.revenueCents),
      therapistCompensationCents: Number(row.therapist_compensation_cents ?? row.therapistCompensationCents),
      managementCompensationCents: Number(
        row.management_compensation_cents ?? row.managementCompensationCents,
      ),
      softwareAndTechnologyCents: Number(
        row.software_and_technology_cents ?? row.softwareAndTechnologyCents,
      ),
      totalExpensesCents: Number(row.total_expenses_cents ?? row.totalExpensesCents),
      netIncomeCents: Number(row.net_income_cents ?? row.netIncomeCents),
      notes: (row.notes as string | null) ?? null,
    };
  }
}
