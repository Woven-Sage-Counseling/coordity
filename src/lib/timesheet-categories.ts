export const TIMESHEET_WORK_CATEGORIES = [
  { key: 'quickbooks', label: 'QuickBooks', color: '#2CA01C' },
  { key: 'simple_practice', label: 'SimplePractice', color: '#1a73e8' },
  { key: 'website', label: 'Website', color: '#7c3aed' },
  { key: 'branding', label: 'Branding', color: '#db2777' },
  { key: 'social_media', label: 'Social Media', color: '#ea580c' },
  { key: 'marketing', label: 'Marketing', color: '#ca8a04' },
  { key: 'banking', label: 'Banking', color: '#0891b2' },
  { key: 'credentialing', label: 'Credentialing', color: '#4f46e5' },
  { key: 'training', label: 'Training', color: '#059669' },
  { key: 'client_outreach', label: 'Client Outreach', color: '#0d9488' },
  { key: 'client_transfer', label: 'Client Transfer', color: '#65a30d' },
  { key: 'billing', label: 'Billing', color: '#dc2626' },
] as const;

export type TimesheetWorkCategoryKey = (typeof TIMESHEET_WORK_CATEGORIES)[number]['key'];

const CATEGORY_KEYS = new Set<string>(TIMESHEET_WORK_CATEGORIES.map((item) => item.key));

export function isTimesheetWorkCategory(value: string): value is TimesheetWorkCategoryKey {
  return CATEGORY_KEYS.has(value);
}

export function getTimesheetWorkCategory(key: string) {
  return TIMESHEET_WORK_CATEGORIES.find((item) => item.key === key) ?? null;
}

export function getTimesheetWorkCategoryLabel(key: string): string {
  return getTimesheetWorkCategory(key)?.label ?? key;
}
