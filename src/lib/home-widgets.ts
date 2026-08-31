import { sanitizeHeaderColors } from './home-widget-header';
import { sanitizeHeaderIcons, type WidgetIconId } from './home-widget-icons';

export const HOME_WIDGET_MAX = 10;

export type HomeWidgetId =
  | 'quickbooks'
  | 'schedule'
  | 'caseload'
  | 'time_off'
  | 'timesheet'
  | 'my_progress'
  | 'tasks'
  | 'credentialing';

export interface HomeWidgetDef {
  id: HomeWidgetId;
  label: string;
  description: string;
  /** Default header bar color; app-branded widgets set their brand color here. */
  brandHeaderColor?: string;
  /** Fixed app logo; when set the widget icon cannot be customized. */
  brandIconSrc?: string;
  /** Permission gate; omit if available to everyone with portal access. */
  requiresFinancials?: boolean;
  requiresCredentialing?: boolean;
  requiresClinical?: boolean;
}

export interface HomeWidgetAccess {
  canSeeFinancials: boolean;
  canSeeCredentialing: boolean;
  canSeeClinical: boolean;
}

/** Registry of home widgets. Add new widgets here as they are built. */
export const HOME_WIDGET_CATALOG: HomeWidgetDef[] = [
  {
    id: 'schedule',
    label: 'Calendar',
    description: 'Clinical or practice calendar from Google Calendar.',
  },
  {
    id: 'caseload',
    label: 'Caseload',
    description: 'Sessions this week, active clients, and caseload fill (preview).',
    requiresClinical: true,
  },
  {
    id: 'time_off',
    label: 'Time off',
    description: 'Submit time-off requests and track pending or approved status.',
  },
  {
    id: 'timesheet',
    label: 'Timesheet',
    description: 'Clock in and out, log hours, and track your weekly total.',
  },
  {
    id: 'my_progress',
    label: 'My progress',
    description: 'Onboarding, training, and compliance progress.',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Personal to-dos and tasks assigned by admins.',
  },
  {
    id: 'credentialing',
    label: 'Credentialing',
    description: 'Look up accepted and in-progress insurance coverage by provider.',
    requiresCredentialing: true,
  },
  {
    id: 'quickbooks',
    label: 'QuickBooks',
    description: 'Profit and loss snapshot and reserve progress.',
    brandHeaderColor: '#2CA01C',
    brandIconSrc: '/app-icons/quickbooks.png',
    requiresFinancials: true,
  },
];

export interface HomeWidgetPrefs {
  /** Ordered list of enabled widget ids (max 10). */
  enabled: HomeWidgetId[];
  /** Widget shown when opening Home. */
  defaultId: HomeWidgetId;
  /** Per-widget header bar overrides (hex colors). */
  headerColors?: Partial<Record<HomeWidgetId, string>>;
  /** Per-widget icon overrides (preset ids). */
  headerIcons?: Partial<Record<HomeWidgetId, WidgetIconId>>;
}

export function widgetPrefsKey(userId: string): string {
  return `portal:home-widgets:${userId}`;
}

export function availableWidgets(access: HomeWidgetAccess): HomeWidgetDef[] {
  return HOME_WIDGET_CATALOG.filter((widget) => {
    if (widget.requiresFinancials && !access.canSeeFinancials) return false;
    if (widget.requiresCredentialing && !access.canSeeCredentialing) return false;
    if (widget.requiresClinical && !access.canSeeClinical) return false;
    return true;
  });
}

function migrateWidgetId(id: string): string {
  return id === 'coming_soon' ? 'my_progress' : id;
}

export function defaultPrefs(access: HomeWidgetAccess): HomeWidgetPrefs {
  const available = availableWidgets(access).map((w) => w.id);
  const preferredOrder: HomeWidgetId[] = [
    'schedule',
    'caseload',
    'time_off',
    'timesheet',
    'my_progress',
    'tasks',
    'credentialing',
    'quickbooks',
  ];
  const enabled = preferredOrder.filter((id) => available.includes(id)).slice(0, HOME_WIDGET_MAX);
  return {
    enabled,
    defaultId: enabled.includes('schedule') ? 'schedule' : (enabled[0] ?? 'schedule'),
  };
}

export function normalizePrefs(raw: unknown, access: HomeWidgetAccess): HomeWidgetPrefs {
  const fallback = defaultPrefs(access);
  const allowed = new Set(availableWidgets(access).map((w) => w.id));

  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as {
    enabled?: unknown;
    defaultId?: unknown;
    headerColors?: unknown;
    headerIcons?: unknown;
  };

  const enabledRaw = Array.isArray(data.enabled) ? data.enabled : [];
  const enabled = enabledRaw
    .map((id) => (typeof id === 'string' ? migrateWidgetId(id) : id))
    .filter((id): id is HomeWidgetId => typeof id === 'string' && allowed.has(id as HomeWidgetId))
    .slice(0, HOME_WIDGET_MAX);

  // Auto-enable brand-new catalog widgets for users with saved prefs.
  if (allowed.has('time_off') && !enabled.includes('time_off') && enabled.length < HOME_WIDGET_MAX) {
    const scheduleIdx = enabled.indexOf('schedule');
    enabled.splice(scheduleIdx >= 0 ? scheduleIdx + 1 : enabled.length, 0, 'time_off');
  }
  if (
    allowed.has('my_progress') &&
    !enabled.includes('my_progress') &&
    enabled.length < HOME_WIDGET_MAX
  ) {
    const timeOffIdx = enabled.indexOf('time_off');
    enabled.splice(timeOffIdx >= 0 ? timeOffIdx + 1 : enabled.length, 0, 'my_progress');
  }
  if (allowed.has('caseload') && !enabled.includes('caseload') && enabled.length < HOME_WIDGET_MAX) {
    const scheduleIdx = enabled.indexOf('schedule');
    enabled.splice(scheduleIdx >= 0 ? scheduleIdx + 1 : enabled.length, 0, 'caseload');
  }
  if (allowed.has('timesheet') && !enabled.includes('timesheet') && enabled.length < HOME_WIDGET_MAX) {
    const timeOffIdx = enabled.indexOf('time_off');
    enabled.splice(timeOffIdx >= 0 ? timeOffIdx + 1 : enabled.length, 0, 'timesheet');
  }
  if (allowed.has('tasks') && !enabled.includes('tasks') && enabled.length < HOME_WIDGET_MAX) {
    const progressIdx = enabled.indexOf('my_progress');
    enabled.splice(progressIdx >= 0 ? progressIdx + 1 : enabled.length, 0, 'tasks');
  }
  if (
    allowed.has('credentialing') &&
    !enabled.includes('credentialing') &&
    enabled.length < HOME_WIDGET_MAX
  ) {
    const tasksIdx = enabled.indexOf('tasks');
    enabled.splice(tasksIdx >= 0 ? tasksIdx + 1 : enabled.length, 0, 'credentialing');
  }

  const finalEnabled = enabled.length > 0 ? enabled : fallback.enabled;
  const defaultRaw =
    typeof data.defaultId === 'string' ? migrateWidgetId(data.defaultId) : data.defaultId;
  const defaultId =
    typeof defaultRaw === 'string' && finalEnabled.includes(defaultRaw as HomeWidgetId)
      ? (defaultRaw as HomeWidgetId)
      : finalEnabled[0]!;

  const headerColors = sanitizeHeaderColors(data.headerColors, allowed);
  const headerIcons = sanitizeHeaderIcons(data.headerIcons, allowed);
  const hasHeaderColors = Object.keys(headerColors).length > 0;
  const hasHeaderIcons = Object.keys(headerIcons).length > 0;

  return {
    enabled: finalEnabled,
    defaultId,
    ...(hasHeaderColors ? { headerColors } : {}),
    ...(hasHeaderIcons ? { headerIcons } : {}),
  };
}
