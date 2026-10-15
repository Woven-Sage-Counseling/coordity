import { nowMs } from './crypto';
import { getEnv } from './env';

export interface AppPortalTheme {
  background: string;
  surface: string;
  accent: string;
  ink: string;
  tabIcon: string;
  icon: string;
  bubbleText: string;
}

export const DEFAULT_APP_PORTAL: AppPortalTheme = {
  background: '#F4F5F8',
  surface: '#FFFFFF',
  accent: '#535F51',
  ink: '#3A3A38',
  tabIcon: '#535F51',
  icon: '#3A3A38',
  bubbleText: '#FFFFFF',
};

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function normalizePortalHex(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!HEX.test(raw)) return fallback;
  return raw.toUpperCase();
}

export function themeFromFields(input: Partial<AppPortalTheme> | null | undefined): AppPortalTheme {
  return {
    background: normalizePortalHex(input?.background, DEFAULT_APP_PORTAL.background),
    surface: normalizePortalHex(input?.surface, DEFAULT_APP_PORTAL.surface),
    accent: normalizePortalHex(input?.accent, DEFAULT_APP_PORTAL.accent),
    ink: normalizePortalHex(input?.ink, DEFAULT_APP_PORTAL.ink),
    tabIcon: normalizePortalHex(input?.tabIcon, DEFAULT_APP_PORTAL.tabIcon),
    icon: normalizePortalHex(input?.icon, DEFAULT_APP_PORTAL.icon),
    bubbleText: normalizePortalHex(input?.bubbleText, DEFAULT_APP_PORTAL.bubbleText),
  };
}

async function ensureAppPortalTable(): Promise<void> {
  const { DB } = getEnv();
  await DB.prepare(
    `CREATE TABLE IF NOT EXISTS app_portal (
      org_id TEXT PRIMARY KEY,
      background TEXT NOT NULL,
      surface TEXT NOT NULL,
      accent TEXT NOT NULL,
      ink TEXT NOT NULL,
      tab_icon TEXT NOT NULL DEFAULT '#535F51',
      icon TEXT NOT NULL DEFAULT '#3A3A38',
      bubble_text TEXT NOT NULL DEFAULT '#FFFFFF',
      updated_at INTEGER NOT NULL
    )`,
  ).run();
  const listed = await DB.prepare(`PRAGMA table_info(app_portal)`).all<{ name: string }>();
  const names = new Set((listed.results ?? []).map((row) => row.name));
  const additions: Array<[string, string]> = [
    ['tab_icon', '#535F51'],
    ['icon', '#3A3A38'],
    ['bubble_text', '#FFFFFF'],
  ];
  for (const [column, fallback] of additions) {
    if (names.has(column)) continue;
    await DB.prepare(`ALTER TABLE app_portal ADD COLUMN ${column} TEXT NOT NULL DEFAULT '${fallback}'`).run();
  }
}

export async function getAppPortalTheme(orgId: string): Promise<{ theme: AppPortalTheme; customized: boolean }> {
  try {
    await ensureAppPortalTable();
    const { DB } = getEnv();
    const row = await DB.prepare(
      `SELECT background, surface, accent, ink,
              tab_icon AS tabIcon, icon, bubble_text AS bubbleText
       FROM app_portal WHERE org_id = ?`,
    )
      .bind(orgId)
      .first<AppPortalTheme>();
    if (!row) return { theme: { ...DEFAULT_APP_PORTAL }, customized: false };
    return { theme: themeFromFields(row), customized: true };
  } catch (error) {
    console.error('app portal theme read failed', error);
    return { theme: { ...DEFAULT_APP_PORTAL }, customized: false };
  }
}

export async function saveAppPortalTheme(orgId: string, input: Partial<AppPortalTheme>): Promise<AppPortalTheme> {
  const theme = themeFromFields(input);
  await ensureAppPortalTable();
  const { DB } = getEnv();
  await DB.prepare(
    `INSERT INTO app_portal (org_id, background, surface, accent, ink, tab_icon, icon, bubble_text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(org_id) DO UPDATE SET
       background = excluded.background,
       surface = excluded.surface,
       accent = excluded.accent,
       ink = excluded.ink,
       tab_icon = excluded.tab_icon,
       icon = excluded.icon,
       bubble_text = excluded.bubble_text,
       updated_at = excluded.updated_at`,
  )
    .bind(
      orgId,
      theme.background,
      theme.surface,
      theme.accent,
      theme.ink,
      theme.tabIcon,
      theme.icon,
      theme.bubbleText,
      nowMs(),
    )
    .run();
  return theme;
}
