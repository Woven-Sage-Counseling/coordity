import type { HomeWidgetId } from './home-widgets';

export type WidgetIconId =
  | 'calendar'
  | 'calendar_plus'
  | 'clock'
  | 'chart'
  | 'checklist'
  | 'users'
  | 'badge'
  | 'star'
  | 'bell'
  | 'bookmark'
  | 'briefcase'
  | 'folder'
  | 'heart'
  | 'home'
  | 'clipboard';

export interface WidgetIconOption {
  id: WidgetIconId;
  label: string;
}

/** Widgets that always use a fixed app logo instead of a pickable icon. */
export const FIXED_BRAND_ICON_WIDGETS = new Set<HomeWidgetId>(['quickbooks']);

export const WIDGET_BRAND_ICON_SRC: Partial<Record<HomeWidgetId, string>> = {
  quickbooks: '/app-icons/quickbooks.png',
};

export const DEFAULT_WIDGET_ICONS: Record<HomeWidgetId, WidgetIconId> = {
  schedule: 'calendar',
  caseload: 'users',
  time_off: 'calendar_plus',
  timesheet: 'clock',
  my_progress: 'chart',
  tasks: 'checklist',
  credentialing: 'badge',
  quickbooks: 'calendar',
};

const ICON_PATHS: Record<WidgetIconId, string> = {
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.75"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  calendar_plus:
    '<path d="M8 3v3M16 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 14h6M12 11v6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  clock:
    '<path d="M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  chart:
    '<path d="M4 19V5M4 19h16M8 15l3-3 2 2 5-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  checklist:
    '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 8v6M23 11h-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  badge:
    '<path d="M9 12l2 2 4-4M7 4h10a2 2 0 0 1 2 2v14l-7-3-7 3V6a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>',
  star:
    '<path d="M12 3.5 14.6 9l6 .5-4.6 3.8 1.5 6-5.5-3.4L7 19.3l1.5-6L4 9.5l6-.5L12 3.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
  bell:
    '<path d="M12 4a4 4 0 0 0-4 4v2.2c0 .8-.3 1.6-.8 2.2L5.5 15.5h13l-1.7-3.1a3.5 3.5 0 0 1-.8-2.2V8a4 4 0 0 0-4-4Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  bookmark:
    '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-3.5L6 20V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
  briefcase:
    '<path d="M9 7V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1M5 9h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M5 13h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  folder:
    '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v7A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5v-9Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-9.2C5 7.8 7.2 6 9.5 6c1.3 0 2.5.6 3.3 1.6.8-1 2-1.6 3.3-1.6 2.3 0 4.5 1.8 4.5 4.8C19 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
  home:
    '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
  clipboard:
    '<path d="M9 5h6a2 2 0 0 1 2 2v13H7V7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9 3.5h6a1.5 1.5 0 0 1 1.5 1.5V5H7.5V5A1.5 1.5 0 0 1 9 3.5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>',
};

export const WIDGET_ICON_OPTIONS: WidgetIconOption[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'calendar_plus', label: 'Calendar plus' },
  { id: 'clock', label: 'Clock' },
  { id: 'chart', label: 'Chart' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'users', label: 'People' },
  { id: 'badge', label: 'Badge' },
  { id: 'star', label: 'Star' },
  { id: 'bell', label: 'Bell' },
  { id: 'bookmark', label: 'Bookmark' },
  { id: 'briefcase', label: 'Briefcase' },
  { id: 'folder', label: 'Folder' },
  { id: 'heart', label: 'Heart' },
  { id: 'home', label: 'Home' },
  { id: 'clipboard', label: 'Clipboard' },
];

const ICON_IDS = new Set<WidgetIconId>(WIDGET_ICON_OPTIONS.map((option) => option.id));

export function isWidgetIconId(value: string): value is WidgetIconId {
  return ICON_IDS.has(value as WidgetIconId);
}

export function isWidgetIconCustomizable(widgetId: HomeWidgetId): boolean {
  return !FIXED_BRAND_ICON_WIDGETS.has(widgetId);
}

export function getWidgetDefaultIcon(widgetId: HomeWidgetId): WidgetIconId {
  return DEFAULT_WIDGET_ICONS[widgetId];
}

export function resolveWidgetHeaderIcon(
  widgetId: HomeWidgetId,
  headerIcons?: Partial<Record<HomeWidgetId, WidgetIconId>>,
): WidgetIconId {
  const custom = headerIcons?.[widgetId];
  if (custom && isWidgetIconId(custom)) return custom;
  return getWidgetDefaultIcon(widgetId);
}

export function widgetIconMarkup(iconId: WidgetIconId): string {
  const paths = ICON_PATHS[iconId];
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths}</svg>`;
}

export function sanitizeHeaderIcons(
  raw: unknown,
  allowed: Iterable<HomeWidgetId>,
): Partial<Record<HomeWidgetId, WidgetIconId>> {
  if (!raw || typeof raw !== 'object') return {};
  const allowedSet = new Set(allowed);
  const icons: Partial<Record<HomeWidgetId, WidgetIconId>> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!allowedSet.has(key as HomeWidgetId)) continue;
    if (FIXED_BRAND_ICON_WIDGETS.has(key as HomeWidgetId)) continue;
    if (typeof value === 'string' && isWidgetIconId(value)) {
      icons[key as HomeWidgetId] = value;
    }
  }

  return icons;
}

export function applyWidgetHeaderIcons(
  root: Element | Document,
  headerIcons?: Partial<Record<HomeWidgetId, WidgetIconId>>,
): void {
  root.querySelectorAll('[data-widget-header]').forEach((header) => {
    if (!(header instanceof HTMLElement)) return;
    const widgetId = header.dataset.widgetId as HomeWidgetId | undefined;
    if (!widgetId || !isWidgetIconCustomizable(widgetId)) return;

    const iconEl = header.querySelector('[data-widget-icon]');
    if (!(iconEl instanceof HTMLElement)) return;

    const iconId = resolveWidgetHeaderIcon(widgetId, headerIcons);
    iconEl.dataset.iconId = iconId;
    iconEl.innerHTML = widgetIconMarkup(iconId);
  });
}
