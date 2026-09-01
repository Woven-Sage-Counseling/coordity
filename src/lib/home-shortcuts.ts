export interface ShortcutTarget {
  path: string;
  label: string;
}

export const SHORTCUT_CATALOG: ShortcutTarget[] = [
  { path: '/workspace', label: 'Workspace' },
  { path: '/apps', label: 'App links' },
  { path: '/directory', label: 'Directory' },
  { path: '/account', label: 'Account' },
  { path: '/financials', label: 'Financials' },
  { path: '/announcements', label: 'Announcements' },
  { path: '/notifications', label: 'Notifications' },
  { path: '/admin', label: 'Admin' },
];

export const SHORTCUT_SEED_PATHS = ['/directory', '/apps', '/account'] as const;

export const SHORTCUT_TOP_N = 3;

export function shortcutLabel(path: string): string {
  return SHORTCUT_CATALOG.find((item) => item.path === path)?.label ?? path;
}

export function storageKey(userId: string): string {
  return `portal:home-visits:${userId}`;
}

/** Paths the signed-in user is allowed to count toward most-visited. */
export function allowedShortcutPaths(input: {
  canSeeFinancials: boolean;
  canSeeAdmin: boolean;
}): string[] {
  return SHORTCUT_CATALOG.map((item) => item.path).filter((path) => {
    if (path === '/financials') return input.canSeeFinancials;
    if (path === '/admin') return input.canSeeAdmin;
    return true;
  });
}

export function seedShortcuts(allowed: string[]): ShortcutTarget[] {
  return SHORTCUT_SEED_PATHS.filter((path) => allowed.includes(path)).map((path) => ({
    path,
    label: shortcutLabel(path),
  }));
}

export function rankShortcuts(
  counts: Record<string, number>,
  allowed: string[],
): ShortcutTarget[] {
  const ranked = Object.entries(counts)
    .filter(([path, count]) => allowed.includes(path) && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, SHORTCUT_TOP_N)
    .map(([path]) => ({ path, label: shortcutLabel(path) }));

  if (ranked.length >= SHORTCUT_TOP_N) return ranked;

  const seeded = seedShortcuts(allowed);
  const seen = new Set(ranked.map((item) => item.path));
  for (const item of seeded) {
    if (seen.has(item.path)) continue;
    ranked.push(item);
    seen.add(item.path);
    if (ranked.length >= SHORTCUT_TOP_N) break;
  }
  return ranked;
}
