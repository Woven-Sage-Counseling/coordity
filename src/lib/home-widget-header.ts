import { HOME_WIDGET_CATALOG, type HomeWidgetId } from './home-widgets';
import { applyWidgetHeaderIcons, type WidgetIconId } from './home-widget-icons';

export const DEFAULT_WIDGET_HEADER_COLOR = '#535f51';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

export function getWidgetDefaultHeaderColor(widgetId: HomeWidgetId): string {
  const widget = HOME_WIDGET_CATALOG.find((entry) => entry.id === widgetId);
  return widget?.brandHeaderColor ?? DEFAULT_WIDGET_HEADER_COLOR;
}

export function resolveWidgetHeaderColor(
  widgetId: HomeWidgetId,
  headerColors?: Partial<Record<HomeWidgetId, string>>,
): string {
  const custom = headerColors?.[widgetId];
  if (custom && isValidHexColor(custom)) return custom;
  return getWidgetDefaultHeaderColor(widgetId);
}

export function widgetHeaderForeground(background: string): string {
  const hex = background.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#393a3d' : '#f7f4ee';
}

export function sanitizeHeaderColors(
  raw: unknown,
  allowed: Iterable<HomeWidgetId>,
): Partial<Record<HomeWidgetId, string>> {
  if (!raw || typeof raw !== 'object') return {};
  const allowedSet = new Set(allowed);
  const colors: Partial<Record<HomeWidgetId, string>> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!allowedSet.has(key as HomeWidgetId)) continue;
    if (typeof value === 'string' && isValidHexColor(value)) {
      colors[key as HomeWidgetId] = value;
    }
  }

  return colors;
}

export function applyWidgetHeaderColors(
  root: Element | Document,
  headerColors?: Partial<Record<HomeWidgetId, string>>,
): void {
  root.querySelectorAll('[data-widget-header]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const widgetId = node.dataset.widgetId;
    if (!widgetId) return;

    const background = resolveWidgetHeaderColor(widgetId as HomeWidgetId, headerColors);
    node.style.setProperty('--widget-header-bg', background);
    node.style.setProperty('--widget-header-fg', widgetHeaderForeground(background));
  });
}

export function applyWidgetHeaderPrefs(
  root: Element | Document,
  prefs?: {
    headerColors?: Partial<Record<HomeWidgetId, string>>;
    headerIcons?: Partial<Record<HomeWidgetId, WidgetIconId>>;
  },
): void {
  applyWidgetHeaderColors(root, prefs?.headerColors);
  applyWidgetHeaderIcons(root, prefs?.headerIcons);
}
