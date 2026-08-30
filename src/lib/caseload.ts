import { hasPermission } from './permissions';
import { currentWeekRange, formatWeekLabel } from './timesheet';

/** Snapshot shape for the caseload widget. Replace the placeholder provider when wired up. */
export interface CaseloadSnapshot {
  /** True while the widget uses demo data instead of a live source. */
  isPlaceholder: true;
  weekLabel: string;
  sessionsThisWeek: number;
  sessionsRemainingThisWeek: number;
  activeClients: number;
  newClientsThisMonth: number;
  intakesPending: number;
  /** Target caseload for utilization display; null hides the bar. */
  caseloadTarget: number | null;
}

export function canSeeCaseload(employee: PortalEmployee | null): boolean {
  return hasPermission(employee, 'apps:clinical');
}

/**
 * Placeholder caseload data until a live source (e.g. SimplePractice) is connected.
 * Swap this for a real fetch in the same function signature later.
 */
export function getCaseloadSnapshot(_userId: string): CaseloadSnapshot {
  const { start, end } = currentWeekRange();
  const activeClients = 24;
  const caseloadTarget = 30;

  return {
    isPlaceholder: true,
    weekLabel: formatWeekLabel(start, end),
    sessionsThisWeek: 11,
    sessionsRemainingThisWeek: 3,
    activeClients,
    newClientsThisMonth: 2,
    intakesPending: 1,
    caseloadTarget,
  };
}

export function caseloadUtilizationPercent(snapshot: CaseloadSnapshot): number | null {
  if (snapshot.caseloadTarget == null || snapshot.caseloadTarget <= 0) return null;
  return Math.min(100, Math.round((snapshot.activeClients / snapshot.caseloadTarget) * 100));
}
