export const HOME_WIDGET_MAX = 10;

export type HomeWidgetId = 'quickbooks' | 'schedule';

export interface HomeWidgetDef {
  id: HomeWidgetId;
  label: string;
  description: string;
  /** Permission gate; omit if available to everyone with portal access. */
  requiresFinancials?: boolean;
}

/** Registry of home widgets. Add new widgets here as they are built. */
export const HOME_WIDGET_CATALOG: HomeWidgetDef[] = [
  {
    id: 'quickbooks',
    label: 'QuickBooks',
    description: 'Profit and loss snapshot and reserve progress.',
    requiresFinancials: true,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    description: 'Clinical or practice calendar and time-off request.',
  },
];

export interface HomeWidgetPrefs {
  /** Ordered list of enabled widget ids (max 10). */
  enabled: HomeWidgetId[];
  /** Widget shown when opening Home. */
  defaultId: HomeWidgetId;
}

export function widgetPrefsKey(userId: string): string {
  return `portal:home-widgets:${userId}`;
}

export function availableWidgets(canSeeFinancials: boolean): HomeWidgetDef[] {
  return HOME_WIDGET_CATALOG.filter((widget) => {
    if (widget.requiresFinancials && !canSeeFinancials) return false;
    return true;
  });
}

export function defaultPrefs(canSeeFinancials: boolean): HomeWidgetPrefs {
  const available = availableWidgets(canSeeFinancials).map((w) => w.id);
  const enabled = available.slice(0, HOME_WIDGET_MAX);
  return {
    enabled,
    defaultId: enabled.includes('schedule')
      ? 'schedule'
      : (enabled[0] ?? 'schedule'),
  };
}

export function normalizePrefs(
  raw: unknown,
  canSeeFinancials: boolean,
): HomeWidgetPrefs {
  const fallback = defaultPrefs(canSeeFinancials);
  const allowed = new Set(availableWidgets(canSeeFinancials).map((w) => w.id));

  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as { enabled?: unknown; defaultId?: unknown };

  const enabledRaw = Array.isArray(data.enabled) ? data.enabled : [];
  const enabled = enabledRaw
    .filter((id): id is HomeWidgetId => typeof id === 'string' && allowed.has(id as HomeWidgetId))
    .slice(0, HOME_WIDGET_MAX);

  const finalEnabled = enabled.length > 0 ? enabled : fallback.enabled;
  const defaultId =
    typeof data.defaultId === 'string' && finalEnabled.includes(data.defaultId as HomeWidgetId)
      ? (data.defaultId as HomeWidgetId)
      : finalEnabled[0]!;

  return { enabled: finalEnabled, defaultId };
}
