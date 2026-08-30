export const COVERAGE_STATUS_VALUES = [
  'application_submitted',
  'credentialing',
  'in_network',
  'denied',
  'terminated',
  'not_participating',
] as const;

export type CoverageStatus = (typeof COVERAGE_STATUS_VALUES)[number];
export type CoverageStatusKey = CoverageStatus | 'not_started';

export const COVERAGE_STATUS_OPTIONS: Array<{ value: CoverageStatusKey; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'application_submitted', label: 'Application submitted' },
  { value: 'credentialing', label: 'Credentialing' },
  { value: 'in_network', label: 'In network' },
  { value: 'denied', label: 'Denied' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'not_participating', label: 'Not participating' },
];

const PILL_CLASSES: Record<CoverageStatusKey, string> = {
  not_started: 'bg-slate-100 text-slate-600',
  application_submitted: 'bg-sky-100 text-sky-900',
  credentialing: 'bg-amber-100 text-amber-900',
  in_network: 'bg-emerald-100 text-emerald-900',
  denied: 'bg-red-100 text-red-900',
  terminated: 'bg-orange-100 text-orange-900',
  not_participating: 'bg-stone-100 text-stone-700',
};

const LABELS = Object.fromEntries(
  COVERAGE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<CoverageStatusKey, string>;

export function normalizeCoverageStatus(raw: string): CoverageStatus | null {
  if (raw === 'accepted') return 'in_network';
  return COVERAGE_STATUS_VALUES.includes(raw as CoverageStatus) ? (raw as CoverageStatus) : null;
}

export function isCoverageStatusKey(value: string): value is CoverageStatusKey {
  return value === 'not_started' || normalizeCoverageStatus(value) !== null;
}

export function isPublicCoverageStatus(status: CoverageStatus): boolean {
  return status === 'in_network' || status === 'credentialing';
}

export function coverageStatusLabel(status: CoverageStatusKey): string {
  return LABELS[status] ?? status;
}

export function coverageStatusPillClass(status: CoverageStatusKey): string {
  return PILL_CLASSES[status] ?? PILL_CLASSES.not_started;
}

export function coverageCellKey(providerId: string, planId: string): string {
  return `${providerId}:${planId}`;
}

export function groupCoverageCellKey(providerId: string, groupId: string): string {
  return `${providerId}:${groupId}`;
}
