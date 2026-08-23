export type PortalTheme = 'light' | 'dark';

export function themeStorageKey(userId?: string | null): string {
  return userId ? `portal:theme:${userId}` : 'portal:theme';
}

export function normalizeTheme(value: unknown): PortalTheme {
  return value === 'dark' ? 'dark' : 'light';
}
